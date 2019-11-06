'use strict';

const AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';
const cognito = new AWS.CognitoIdentityServiceProvider();
const chance = require('chance').Chance();

let random_password = () => {
  // needs number, special char, upper and lower case
  return `${chance.string({ length: 8})}B!gM0uth`;
}

let an_authenticated_user = function* () {
  let userpoolId = process.env.cognito_user_pool_id;
  let clientId = process.env.cognito_server_client_id;

  let firstName = chance.first();
  let lastName = chance.last();
  let username = `test-${firstName}-${lastName}-${chance.string({length: 8})}`;
  let password = random_password();
  let email = `${firstName}-${lastName}@big-mouth.com`;

  // Create a new Cognito user:
  let createReq = {
    UserPoolId: userpoolId,
    Username: username,
    // The "SUPPRESS" value prevents Cognito from sending verification emails:
    MessageAction: 'SUPPRESS',
    TemporaryPassword: password,
    UserAttributes: [
      { Name: "given_name", Value: firstName },
      { Name: "family_name", Value: lastName },
      { Name: "email", Value: email }
    ]
  };
  yield cognito.adminCreateUser(createReq).promise();

  console.log(`[${username}] - user is created`);
  
  // Initialize the authentication flow (stndard for admin user creation):
  let req = {
    AuthFlow: 'ADMIN_NO_SRP_AUTH',
    UserPoolId: userpoolId,
    ClientId: clientId,
    AuthParameters: {
      USERNAME: username,    
      PASSWORD: password
    }
  };
  let resp = yield cognito.adminInitiateAuth(req).promise();

  console.log(`[${username}] - initialised auth flow`);

  // New user is forced to change password during first login attempt:
  let challengeReq = {
    UserPoolId: userpoolId,
    ClientId: clientId,
    ChallengeName: resp.ChallengeName,
    Session: resp.Session,
    ChallengeResponses: {
      USERNAME: username,
      NEW_PASSWORD: random_password()
    }
  };
  // In order to complete the authentication process, we need to respond to the challenge with "adminRespondToAuthChallenge":
  let challengeResp = yield cognito.adminRespondToAuthChallenge(challengeReq).promise();
  
  console.log(`[${username}] - responded to auth challenge`);

  // A successful response will return an Object. 
  // The response Object will contain an "idToken" (*we first worked with idTokens in the 2.7 course module):
  return {
    username,
    firstName,
    lastName,
    idToken: challengeResp.AuthenticationResult.IdToken
  };
};

module.exports = {
  an_authenticated_user
};