var ndnService = angular.module('ndnService', [])
  .service('ndn', function ($httpParamSerializer) {
    // Creates a new NDN face with a RSA key pair in DER as ID certificate.
    this.createFace = function (nfdHost, userId, rsaKeyPair) {
      const identityStorage = new MemoryIdentityStorage();
      const privateKeyStorage = new MemoryPrivateKeyStorage();
      const keyChain = new KeyChain(new IdentityManager(identityStorage,
        privateKeyStorage), new SelfVerifyPolicyManager(identityStorage));
      const keyName = new Name('/' + userId + '/SKEY');
      // The format of the certificate name cannot be modified.
      // Otherwise, the face.registerPrefix() cannot work properly.
      const certificateName = keyName.getSubName(0, keyName.size() - 1)
        .append('KEY').append(keyName.get(-1))
        .append('ID-CERT').append('0');
      identityStorage.addKey(keyName, KeyType.RSA,
        new Blob(rsaKeyPair.publicKey, false));
      privateKeyStorage.setKeyPairForKeyName(keyName, KeyType.RSA,
        rsaKeyPair.publicKey, rsaKeyPair.privateKey);
      console.log('Set KeyChain:', keyName.toString());
      console.log('Set Certificatename:', certificateName.toString());

      const face = new Face({
        host: nfdHost
      });
      face.setCommandSigningInfo(keyChain, certificateName);
      console.log('Create face.');

      return face;
    };

    // Creates and returns interest based on input parameters.
    this.createInterest = function (name, params = {}, lifetime = 2000,
      mustBeFresh = true) {
      // If [params] is not empty, append the serialized parameters to the name
      // in the format of "[name]?[key]=[value]&...".
      if (!angular.equals(params, {})) {
        name += '?' + $httpParamSerializer(params);
      }
      const interest = new Interest(new Name(name));
      interest.setInterestLifetimeMilliseconds(lifetime);
      interest.setMustBeFresh(mustBeFresh);
      console.log("Create interest:", interest.name.toString());
      return interest;
    };

    // Sends [interest] through [face]. [retry] is the remaining retry times
    // after timeout.
    this.sendInterest = function (face, interest, handleData = () => {},
      handleTimeout = () => {}, retry = 0) {
      // On-data callback.
      const onData = function (interest, data) {
        // TODO: verify data integrity and decrypt.
        console.log("Receive data for interest:", interest.name.toString(),
          "\nData content:", data.content.toString());
        handleData(interest, data.content);
      };

      // On-timeout callback.
      const onTimeout = function (interest) {
        console.log("Timeout interest:", interest.name.toString());
        handleTimeout(interest);
        // If [retry] is larger than 0, double interest lifetime and retry.
        if (retry > 0) {
          console.log(retry.toString(), "retry times left. Retrying...");
          interest.setInterestLifetimeMilliseconds(2 * interest.getInterestLifetimeMilliseconds());
          this.sendInterest(face, interest, handleData, handleTimeout, retry - 1);
        }
      }.bind(this);

      // Express interest.
      face.expressInterest(interest, onData, onTimeout);
      console.log("Send interest:", interest.name.toString());
    };

    // Registers [prefix] and returns the registered prefix ID.
    this.registerPrefix = function (face, prefix, handleInterest = () => {},
      handleRegisterFailed = () => {}, handleRegisterSuccess = () => {}) {
      // On-interest callback.
      const onInterest = function (prefix, interest, face, interestFilterId,
        filter) {
        console.log("Receive interest:", interest.getName().toUri());
        // TODO: verify interest.
        // Get response by calling handleInterest().
        const response = handleInterest(interest);
        // If response is null, do not send any response.
        if (response === null) return;
        // Set the data name to the same as the interest. Otherwise, the
        // response data name will not match the interest name, which will
        // result in interest timeout.
        response.setName(interest.getName());
        // Sign and send response.
        face.commandKeyChain.sign(response, face.commandCertificateName,
          function () {
            try {
              face.putData(response);
              console.log("Send data of name:", response.getName().toString(),
                "\nData content:", response.getContent());
            } catch (error) {
              console.log("Send data error!", error.toString());
            }
          });
      };

      // On-register-failed callback.
      const onRegisterFailed = function (prefix) {
        console.log("Register data failed:", prefix.toUri());
        handleRegisterFailed(prefix);
      };

      // On-register-success callback.
      const onRegisterSuccess = function (prefix, registeredPrefixId) {
        console.log("Register data succeeded:", prefix.toUri(), "with id",
          registeredPrefixId);
        handleRegisterSuccess(prefix, registeredPrefixId);
      };

      // Register prefix.
      const registeredPrefixId = face.registerPrefix(new Name(prefix),
        onInterest, onRegisterFailed, onRegisterSuccess);
      console.log("Register prefix:", prefix, "with ID:", registeredPrefixId);
      return registeredPrefixId;
    };

    // Remove a registered prefix with ID [registeredPrefixId] from [face].
    this.removeRegisteredPrefix = function (face, registeredPrefixId) {
      face.removeRegisteredPrefix(registeredPrefixId);
      console.log("Remove registered prefix with ID:", registeredPrefixId);
    };
  });
