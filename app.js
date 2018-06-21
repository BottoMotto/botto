"use strict";

//�K�v�ȃ��W���[����ݒ肷��
var bodyParser = require('body-parser');
var createError = require('http-errors');
var express = require('express');
var path = require('path');

//var cookieParser = require('cookie-parser');
var logger = require('morgan');
var request = require('request');
var requestjs = require("request-json");
var crypto = require("crypto");

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var watson = require('watson-developer-cloud');

//�K�v�ȕϐ���錾����
var assistant = new watson.AssistantV1({
  username: 'c1ec70c1-8c9b-4034-84f2-a22f59077b74',
  password: 'O0UJk2vwrUo6',
  version: '2018-02-16'
});
var WORKSPACE_ID = "04e5a00e-30a7-4bb0-ae32-7bf1d2ea0c04";

var APP_ID = "d3dabce6-fe7f-44f6-b5a6-c9c5a64028a4";
var APP_SECRET = "_17Pn8-lup9N4VNd1PI2NN-quWaA";
//var SPACE_ID = "5adc0cf7e4b0e07697c7d6ef";  //higaki test space
//var SPACE_ID = "5ad084c2e4b06b62432c3090";  //CS_Kaizen space
var SPACE_ID = "5b1f90ade4b0859c2360cea2";  //CS_Kaizen-AppTest space
var APP_WEBHOOK_SECRET = "5qjtw46iee0weebng5b2erih54iit8d";

const WWS_URL = "https://api.watsonwork.ibm.com"
const AUTHORIZATION_API = "/oauth/token";
const OAUTH_ENDPOINT = "/oauth/authorize";


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
var previous_context;
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//express�ݒ�ɕK�v�Ȃ��܂��Ȃ�
var app = express();
app.use(express.static(path.join(__dirname, '/public')));
var jsonParser = bodyParser.json();


//Watson Workspace�ƒʐM�ɕK�v�ȃA�N�Z�Xtoken���擾����֐�����������
//token�擾���N�G�X�g�ɕK�v�ȃI�v�V�����I�u�W�F�N�g���`����
function getJWTToken(userid, password, callback){
  const authentificationOptions = {
    "method":"POST",
    "url":`${WWS_URL}${AUTHORIZATION_API}`,
    "auth":{
      "user":userid,
      "pass":password
    },
    "form":{
      "grant_type":"client_credentials"
    }
  };

  request(authentificationOptions, function(err, response, authentificationBody){
     if(response.statusCode !== 200){
       console.log("ERROR: App cant authenticate");
       callback(null);
     }
     const accessToken = JSON.parse(authentificationBody).access_token;
     callback(accessToken)
   });
};

function postMessageToSpace(spaceId, accessToken, textMsg, callback){
  var jsonClient = requestjs.createClient(WWS_URL);
  var urlToPostMessage = "/v1/spaces/" + spaceId + "/messages";
  jsonClient.headers.jwt = accessToken;

  var messageData = {
    type:"appMessage",
    version:1.0,
    annotations:[
      {
        type:"generic",
        version:1.0,
        color:"#00B6CB",
        text:textMsg
      }
    ]
  };


 console.log("Message body : %s", JSON.stringify(messageData));

  jsonClient.post(urlToPostMessage, messageData, function(err, jsonRes, jsonBody){
    if(jsonRes.statusCode === 201){
      console.log("Message posted to IBM watson Workspace successfully!");
      callback(true);
    } else{
      console.log("Error posting to Watson Workspace");
      console.log("Return code : " + jsonRes.statusCode);
      console.log(jsonBody);
      callback(false);
    }
  });
};

//Watson Workspace�Ƀ��b�Z�[�W�𑗂�֐����Ăяo��API��p�ӂ���
app.get("/inspiration", function(req, res){
  var myMsg = req.query.msg;

  getJWTToken(APP_ID,APP_SECRET, function(jwt){
    console.log("JWT Token : ", jwt);
    postMessageToSpace(SPACE_ID, jwt, myMsg, function(success){
      if(success){
        res.status(200).end();
      } else{
        res.status(500).end();
      }
    });
  });
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//������
function load_previous_context_from_db(userID){
   if(!userID){
      console.log("Error:Missing variables");
      return;
   } else{
      return previous_context;//��U�x�^�����A�{����DB������������Ă���
   }
}
function write_context_to_db(userID, context){
   if(!userID){
      console.log("Error:Missing variables");
      return;
   } else{
      previous_context = context;//��U�x�^�����A�{����DB�ɏ����ɍs��
      return;
   }
   /*
   var userName = request.body.name;
   var doc = { "name" : userName };
   if(!mydb) {
     console.log("No database.");
     response.send(doc);
     return;
   }
   mydb.insert(doc, function(err, body, header) {
     if (err) {
       console.log('[mydb.insert] ', err.message);
       response.send("Error");
       return;
     }
     doc._id = body.id;
     response.send(doc);
  });
*/
}

function sleep(a){
  var dt1 = new Date().getTime();
  var dt2 = new Date().getTime();
  while (dt2 < dt1 + a){
    dt2 = new Date().getTime();
  }
  return;
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//����̏d�v�� Webhook�@�\�p��callback�p��API���`����
//Webhook�Ƃ��ēo�^��������API�́AWorkspace������l�X�ȃC�x���g���󂯎��A���ꂼ��̃C�x���g�ɑ΂��A�����������邱�Ƃ��ł���
app.post("/callback", jsonParser, function(req, res) {
  if(!APP_ID || !APP_SECRET || !APP_WEBHOOK_SECRET){
    console.log("Error:Missing variables");
    return;
  }
  console.log(req.body);
  if(req.body.type === 'verification'){
    console.log('Got Webhook verification challenge ' + JSON.stringify(req.body));

    var bodyToSend = {
      response:req.body.challenge
    };

    var hashToSend = crypto.createHmac('sha256', APP_WEBHOOK_SECRET).update(JSON.stringify(bodyToSend)).digest('hex');

    res.set('X-OUTBOUND-TOKEN', hashToSend);
    res.send(bodyToSend);
    return;
  }

  if(req.body.userId === APP_ID){
    console.log("Message from myself");
    res.status(200).end();
    return;
  }

  if(req.body.content === ""){
    console.log("Empty");
    res.status(200).end();
    return;
  }
  res.status(200).end();

  if(req.body.type === 'message-created'){
    console.log("Message Created received");
    console.log(req.body.content);

    assistant.message({
      workspace_id: WORKSPACE_ID,
      input: {'text': req.body.content},
      context: load_previous_context_from_db(req.body.userId)////////////////////////////////////////
///////////////////////
      }, function(err, response) {
      if (err)
        console.log('error:', err);
      else
      getJWTToken(APP_ID, APP_SECRET, function(jwt){
        console.log("JWT Token :", jwt);
        write_context_to_db(req.body.userId, response.context);//////////////////////////////////////
///////////////////////
         for(var i in response.output.text){
            postMessageToSpace(req.body.spaceId, jwt, response.output.text[i], function(success){
            return;
            });
            sleep(100);
         }
      });
   });
    return;
  }
});
module.exports = app;
