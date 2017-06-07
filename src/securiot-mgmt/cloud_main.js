/*************************************************************************
 *
 * $file: mqtt_broker.js
 *
 * @brief: cloud module code
 *
 * @author: Saurabh Singh
 *
 * @date: 15 May 2017 First version of broker code..data sending to azure server
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/
var fs       = require('fs');
var os       = require("os");
var exec     = require('child_process').exec;
var mqtt     = require('mqtt')
var moment   = require('moment-timezone');

var azureIoT = require('azure-iot-device');
var azureDM  = require('./cloud_azure_directmethod');
var azureDT  = require('./cloud_azure_devicetwin');
var azureC2D = require('./cloud_azure_c2dmessage');

var awsIoT   = require('aws-iot-device-sdk');
var awsTS    = require('./cloud_aws_thingshadow');
var awsDM    = require('./cloud_aws_directmessage');

var azureConnectCallback = function (err)
{
   if (err) {

      log.error('Azure Cloud Client connection failed : ' + err);
   } else {

      log.debug('Azure Cloud Client connected');
      //cloudClient.on('message', azureC2D.onC2DMessage);
      cloudClient.getTwin(azureDT.onConfigChange);
      cloudClient.onDeviceMethod('firmwareUpdate', azureDM.onFirmwareUpdate);
      cloudClient.onDeviceMethod('reboot', azureDM.onReboot);
      cloudClient.onDeviceMethod('factoryReset', azureDM.onFactoryReset);
      cloudClient.onDeviceMethod('remoteDiagnostic', azureDM.onRemoteDiagnostic);
   }
};

var awsConnectCallback = function (err)
{
	if (err) {
		log.error('AWS Cloud Client connection failed : ' + err);
	} else {
		log.debug('AWS Cloud Client connected');
		awsRemoteConfigTopic = awsBaseTopic+'/topic/remoteconfig';
		cloudClient.on ('update', awsTS.updateCallback);
		cloudClient.on('status', awsTS.statusCallback);
		cloudClient.on('message', awsDM.messageCallback);
		cloudClient.register (iotHubName, { ignoreDeltas: true },
			function (err, failedTopics) {
				if ((err === undefined) && (failedTopics === undefined)) {
					cloudClient.subscribe (awsRemoteConfigTopic);
				}
			}
		);
	}
};

var awsReconnectCallback = function (err)
{
	if (err) {
		log.error('AWS Cloud Client reconnection failed : ' + err);
	} else {
		log.debug('AWS Cloud Client reconnected');
		awsRemoteConfigTopic = awsBaseTopic+'/topic/remoteconfig';
		cloudClient.on ('update', awsTS.updateCallback);
		cloudClient.on('status', awsTS.statusCallback);
		cloudClient.register (iotHubName, { ignoreDeltas: true },
			function (err, failedTopics) {
				if ((err === undefined) && (failedTopics === undefined)) {
					cloudClient.subscribe (awsRemoteConfigTopic);
				}
			}
		);
   }
};

var awsCloseCallback = function (err)
{
   if (err) {
      log.error('AWS Cloud Client close failed : ' + err);
   } else {
      log.debug('AWS Cloud Client closed');
   }
};

var awsOfflineCallback = function (err)
{
   if (err) {
      log.error('AWS Cloud Client offline failed : ' + err);
   } else {
      log.debug('AWS Cloud Client became offline');
   }
};

var awsErrorCallback = function (err)
{
   if (err) {
      log.error('AWS Cloud Client error failed : ' + err);
   } else {
      log.debug('AWS Cloud Client has error');
   }
};

var mqttLocalClientInit = function(callback)
{
   log.debug('MQTT local client init');

   if (fs.existsSync('/etc/securiot.in/config.txt')) {

      localConfigData  = fs.readFileSync('/etc/securiot.in/config.txt');
      parsedConfigData = JSON.parse(localConfigData);

      forwardingRule = parsedConfigData.gatewaySaurabhpi.forwarding_rules;
      localClient    = mqtt.connect('mqtt://localhost')
   }
   if (callback) { callback(); }
}

var mqttCloudClientInit = function (callback)
{
   log.debug('MQTT cloud client init');

   if (fs.existsSync('/etc/securiot.in/config.txt')) {

      serverType = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.ServerType

      switch (serverType) {

      case "azure":
         log.info('AZURE Cloud Server');
         iotHubName       = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AzureConfig.IoTHub;;
         protocol         = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AzureConfig.Protocol;
         deviceId         = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AzureConfig.DeviceId;
         accessKey        = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AzureConfig.AccessKey;
         connectionString = 'HostName='+iotHubName+'.azure-devices.net;DeviceId='+deviceId+';SharedAccessKey='+accessKey;
         clientFromConnectionString = require('azure-iot-device-'+protocol).clientFromConnectionString;

         cloudClient = clientFromConnectionString(connectionString);
         var Message = azureIoT.Message;
         cloudClient.open (azureConnectCallback);
      break;

      case "AWS":
				log.info('Cloud Server is AWS');
				iotHubName = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AWSConfig.DeviceId;
				host = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AWSConfig.Device;
				protocol = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AWSConfig.Protocol;
				accessKey = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AWSConfig.AccessKey;
				cloudClient = awsIoT.thingShadow ({
					keyPath: "/etc/ssl/certs/"+iotHubName+".private.key",
					certPath: "/etc/ssl/certs/"+iotHubName+".cert.pem",
					caPath: "/etc/ssl/certs/"+accessKey,
					clientId: iotHubName,
					keepAlive: 45,
					protocol: protocol,
					host: host});

				awsBaseTopic = 'SecurIoT.in/thing/' + iotHubName;
				cloudClient.on('connect', awsConnectCallback);
				cloudClient.on('close', awsCloseCallback);
				cloudClient.on('reconnect', awsReconnectCallback);
				cloudClient.on('offline', awsOfflineCallback);
				cloudClient.on('error', awsErrorCallback);
		break;
		}
	}
	if (callback) { callback(); }
}

var gatewayUniqueId;

var child = exec('cat /sys/class/net/eth0/address',

      function (error, stdout, stderr) {

         if (error != null) {
            log.debug('exec error: ' + error);
      }

      var wlan = stdout;
      var mac = wlan.split("\n");
        gatewayUniqueId = mac[0].toString();
   });


if (typeof localClient != "undefined") {

   localClient.on('connect', function () {

      log.debug('Local MQTT Client connected, setting up subscriptions');
      localClient.subscribe('gps-data');
      localClient.subscribe('temp-data');
      localClient.subscribe('humid-data');
      localClient.subscribe('no2-data');
      localClient.subscribe('so2-data');
   });
}

//var finalData;
var gpsCount = 0;
var tempCount = 0;
var humidCount = 0;
var so2Count = 0;
var no2Count = 0;

if (typeof localClient != "undefined") {

   localClient.on('message', function (topic, data) {

      //log.debug(data.toString());

      switch (topic) {

      case "gps-data":

         gpsCount ++;
         var now = moment();
         var currentTime   = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');

         var gpsData       = data.toString();
         var splitOutput   = gpsData.split("-");
         var healthScore   = parseFloat(splitOutput[0]);
         var finalScore    = healthScore*2.5;
         var finalGpsData  = JSON.stringify({ sno : gpsCount.toString(), gatewayId : gatewayUniqueId,
                  sensorId : "gps-"+gatewayUniqueId, dataType : splitOutput[2],
                  latitude : splitOutput[0], longitude : splitOutput[1],time : currentTime,qualityScore :finalScore })

         SendDataWhereverRequired (finalGpsData);
         break;

      case "temp-data":

         tempCount ++;
         var now = moment();
         var currentTime   = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');

         var tempData      = data.toString();
         var splitTemp     = tempData.split("-");
         var makeTempData  = parseFloat(splitTemp[0]);
         var finalTemp     = makeTempData*3.0;
         var finalScore    = finalTemp + 12;
         var finalTempData = JSON.stringify({sno : tempCount.toString(), gatewayId : gatewayUniqueId,
                  sensorId : "temp-"+gatewayUniqueId, dataType : splitTemp[2],
                  temperature : finalTemp ,time : currentTime,qualityScore :finalScore})

         SendDataWhereverRequired (finalTempData);
          break;

      case "humid-data":

         humidCount ++;
         var now = moment();
         var currentTime    = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');

         var humidData      = data.toString();
         var splitHumid     = humidData.split("-");
         var makeHumidData  = parseFloat(splitHumid[1]);
         var finalHumid     = makeHumidData+20.0;
         var finalScore     = finalHumid -18;
         var finalHumidData = JSON.stringify({sno :humidCount.toString(), gatewayId : gatewayUniqueId,
                  sensorId : "humid-"+gatewayUniqueId, dataType : splitHumid[2],
                  humidity : finalHumid ,time : currentTime,qualityScore :finalScore})

         SendDataWhereverRequired (finalHumidData);
         break;

      case "no2-data":

         no2Count ++;
         var now = moment();

         var currentTime  = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');

         var no2Data      = data.toString();
         var splitNo2     = no2Data.split("-");
         var makeNo2Data  = parseFloat(splitNo2[0]);
         var finalNo2     = makeNo2Data+7.0;
         var finalScore   = finalNo2 + 14;
         var finalNo2Data = JSON.stringify({sno : no2Count.toString(), gatewayId : gatewayUniqueId,
                  sensorId : "no2-"+gatewayUniqueId, dataType : splitNo2[2],
                  no2 : finalNo2 ,time : currentTime,qualityScore :finalScore})

         SendDataWhereverRequired (finalNo2Data);
          break;

      case "so2-data":

         so2Count ++
         var now = moment();
         var currentTime  = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
         var so2Data      = data.toString();
         var splitSo2     = so2Data.split("-");
         var makeSo2Data  = parseFloat(splitSo2[0]);
         var finalSo2     = makeSo2Data+15.0;
         var finalScore   = finalSo2 -5;
         var finalSo2Data = JSON.stringify({sno : so2Count.toString(), gatewayId : gatewayUniqueId,
                  sensorId : "so2-"+gatewayUniqueId, dataType : splitSo2[2],
                  so2 : finalSo2,time : currentTime ,qualityScore :finalScore})

         SendDataWhereverRequired (finalSo2Data);
         break;
      }
   });
}

var SendDataWhereverRequired = function (finalData)
{
   log.debug(finalData);

   var dataForForwarding = new Message(finalData);

   for (var rule in forwardingRule) {

      switch (forwardingRule[rule].match.data_type) {

      case "any":
         switch(forwardingRule[rule].than.send_to) {

         case "cloud":
            sendToCloud(dataForForwarding);
            return;

         case "analytics":

         sendToAnaltics(dataForForwarding);
            return;

         case "daisy-chained":
            return;

         }
      case "HY":

         switch(forwardingRule[rule].then.sendto) {

         case "cloud":
         //sendToCloud(mesage);
         return;

         case "analytics":
         //sendToAnaltics(message);
         return;

         case "daisy-chained":
         return;

         }
      }
   }
}

var sendToCloud = function(message)
{
   switch (serverType){

   case "azure":
      cloudClient.sendEvent(message, function (err) {

         if (err) log.debug(err.toString());

      });
      break;

   case "AWS":
   break;

   }
}

var updateSystemStatus = function (systemStatus) {
	switch (serverType) {
		case "azure":
			azureDT.updateSystemStatus (systemStatus);
			break;
		case "AWS":
			awsTS.updateSystemStatus (systemStatus);
			break;
	}
}

module.exports.mqttLocalClientInit = mqttLocalClientInit;
module.exports.mqttCloudClientInit = mqttCloudClientInit;
module.exports.updateSystemStatus  = updateSystemStatus;
