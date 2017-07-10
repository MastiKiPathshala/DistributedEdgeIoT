/*************************************************************************
 *
 * $file: cloud_main.js
 *
 * @brief: cloud module code
 *
 * @authors: Saurabh Singh, Prosenjit Pal, Srinibas Maharana
 *
 * @date: 15 May 2017 First version of broker code..data sending to azure server
 *
 * AWS topic for sending sensor data (D -> C):
 * SecurIoT.in/thing/<device ID>/topic/sensor/data
 *
 * Internal MQTT topic (between processes within SecurIoT gateway)
 *
 * topic/sensor/config - sensor config messages from mgmt service to BLE, gpio etc. services
 * topic/sensor/status - connected sensor status from BLE, gpio etc. services to mgmt service
 * topic/sensor/data/<datatype> - sensor data from BLE, gpio etc. services to mgmt service
 * topic/system/config/softwareUpgrade/trigger - Software Upgrade trigger to upgrade service
 * topic/system/config/softwareUpgrade/update - Software Upgrade status from upgrade service
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

var EventEmitter = require('events').EventEmitter;

var uniqueGatewayId;
var cloudServerType;


var so2Count   = 0;
var no2Count   = 0;
var gpsCount   = 0;
var tempCount  = 0;
var humidCount = 0;
var pressureCount  = 0;
var gyroscopeCount = 0;
var accelerometerCount = 0;
var magnetometerCount = 0;
var luxometerCount  = 0;

cloudState     = new EventEmitter();

var cloudConnectStatus = false;

var cloudStateOn = function()
{
   // generate cloud online event
   if (cloudConnectStatus === false) {

      cloudConnectStatus = true;
      cloudState.emit('online');
   }
}

var cloudStateOff = function()
{
   // generate cloud online event
   if (cloudConnectStatus === true) {

      cloudConnectStatus = false;
      cloudState.emit('offline');
   }
}

var azureConnectCallback = function (err)
{
   if (err) {
      log.error('Azure Cloud Client connection failed : ' + err);
   //   setInterval (function () {
   //      cloudClient.open (azureConnectCallback);
   //   }, 1000);
   } else {
      log.debug('Azure Cloud Client connected');
      //cloudClient.on('message', azureC2D.onC2DMessage);
      //client.receive (function (err, res, msg) {
      cloudClient.getTwin(azureDT.onConfigChange);
      cloudClient.onDeviceMethod('softwareUpgrade', azureDM.onSoftwareUpgrade);
      cloudClient.onDeviceMethod('reboot', azureDM.onReboot);
      cloudClient.onDeviceMethod('configReset', azureDM.onConfigReset);
      cloudClient.onDeviceMethod('remoteDiagnostics', azureDM.onRemoteDiagnostics);

   }
};

var azureCloseCallback = function (err, result)
{
   if (err) {
      log.debug ("Azure Cloud connection close failed: " + err);
   } else {
      log.debug ("Azure Cloud connection closed : " + JSON.stringify(result));
		//cloudClient.open (azureConnectCallback);
		if (cloudConnectTimer == null) {
			log.debug ("Azure Cloud connect timer not running, starting now...");
			if (cloudConnectTimeout < CLOUD_CONNECT_MAX_TIMEOUT) {
				cloudConnectTimeout = 2 * cloudConnectTimeout;
			}
			log.debug ("Retrying Azure Cloud connection in " + cloudConnectTimeout/1000 + " seconds");
			cloudConnectTimer = setTimeout (function () {
				cloudClient.open (azureConnectCallback);
			}, cloudConnectTimeout);
		} else {
			log.debug ("Azure Cloud connect timer already running, doing nothing...");
		}
   }
}

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

      cloudClient.register (deviceId, { ignoreDeltas: true },
         function (err, failedTopics) {
            if ((err === undefined) && (failedTopics === undefined)) {
               cloudClient.subscribe (awsRemoteConfigTopic);
            }
         }
      );
   }
}

var awsReconnectCallback = function (err)
{
   if (err) {
      log.error('AWS Cloud Client reconnection failed : ' + err);
   } else {

      log.debug('AWS Cloud Client reconnected');

      awsRemoteConfigTopic = awsBaseTopic+'topic/remoteconfig';
      cloudClient.on ('update', awsTS.updateCallback);
      cloudClient.on('status', awsTS.statusCallback);
      cloudClient.on('message', awsDM.messageCallback);

      cloudClient.register (deviceId, { ignoreDeltas: true },

         function (err, failedTopics) {
            if ((err === undefined) && (failedTopics === undefined)) {
               cloudClient.subscribe (awsRemoteConfigTopic);
            }
         }
      );
   }
}

var awsCloseCallback = function (err)
{
   if (err) {
      log.error('AWS Cloud Client close failed : ' + err);
   } else {
      log.debug('AWS Cloud Client closed');
   }
}

var awsOfflineCallback = function (err)
{
   if (err) {
      log.error('AWS Cloud Client offline failed : ' + err);
   } else {
      log.debug('AWS Cloud Client became offline');
   }
}

var awsErrorCallback = function (err)
{
   if (err) {
      log.error('AWS Cloud Client error failed : ' + err);
   } else {
      log.debug('AWS Cloud Client has error');
   }
}

var mqttLocalClientInit = function(callback)
{
   log.debug('MQTT local client init');
   exec('cat /sys/class/net/eth0/address',

      function (error, stdout, stderr) {

         if (error != null) {
               log.debug('exec error: ' + error);
         }

         var wlan       = stdout;
         var mac        = wlan.split("\n");
         uniqueGatewayId = mac[0].toString();
});

	if (fs.existsSync('/etc/securiot.in/config.txt')) {

		localConfigData  = fs.readFileSync('/etc/securiot.in/config.txt');
		parsedConfigData = JSON.parse(localConfigData);

		forwardingRule = parsedConfigData.gatewaySaurabhpi.forwarding_rules;
		localClient    = mqtt.connect('mqtt://localhost')

		localClient.on('connect', function () {

			log.debug('Local MQTT Client connected, setting up subscriptions');
			
			localClient.subscribe('topic/sensor/data/#');
			localClient.subscribe('topic/sensor/status');
			localClient.subscribe('topic/system/config/softwareUpgrade/update');
		})

		localClient.on('message', function (topic, data) {

			log.trace("data from topic: " + topic + " data : " + data.toString());

			var now = moment();
			var currentTime   = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');

			switch (topic) {

				case "topic/system/config/softwareUpgrade/update":

					// Receive update message from securiot-upgrade service
					updateRemoteCmdStatus ('softwareUpgrade', data.status, data.msg, '');
					break;

				case "topic/sensor/status":
					
					// Report list of sensor types to properties/reported/SensorStatus
					
					updateSensorStatus (data);
					break;

				case "topic/sensor/data/gps":

					gpsCount ++;

					var gpsData       = data.toString();
					var splitOutput   = gpsData.split("-");
					var healthScore   = parseFloat(splitOutput[0]);
					var finalGpsData  = JSON.stringify({ sno : gpsCount.toString(), gatewayId : uniqueGatewayId,
						sensorId : "gps-"+uniqueGatewayId, dataType : splitOutput[2],
						latitude : splitOutput[0], longitude : splitOutput[1], time : currentTime});

					mqttRelayDataSend (finalGpsData,forwardingRule);
					break;
			
				case "topic/sensor/data/gyroscope":

					gyroscopeCount ++;
					var now = moment();
					var currentTime = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
			
					var gyroscope = data.toString();
					var splitGyroscope =gyroscope.split("-");
					var gyroscopeData = splitGyroscope[0];
					var splitGyroscopeData = gyroscopeData.split(",");
					var gyroscopeX = parseFloat(splitGyroscopeData[0]);
					var gyroscopeY = parseFloat(splitGyroscopeData[1]);
					var gyroscopeZ = parseFloat(splitGyroscopeData[2]);
					var finalGyroscopeData = JSON.stringify({sno :gyroscopeCount .toString(), gatewayId : uniqueGatewayId,
					sensorId : "gyroscope-"+splitGyroscope[1], dataType :splitGyroscope[2],dataUnit:splitGyroscope[3],
					gyroscope_x:gyroscopeX, gyroscope_y:gyroscopeY, gyroscope_z:gyroscopeZ, time : currentTime})

					mqttRelayDataSend (finalGyroscopeData,forwardingRule);
					break;	
		
				case "topic/sensor/data/accelerometer":

					accelerometerCount ++;
					var now = moment();
					var currentTime = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
			
					var accelerometer = data.toString();
					var splitAccelerometer = accelerometer.split("-");
					var accelerometerData = splitAccelerometer[0];
					var splitAccelerometerData = accelerometerData.split(",");
					var accelerometerX = parseFloat(splitAccelerometerData[0]);
					var accelerometerY = parseFloat(splitAccelerometerData[1]);
					var accelerometerZ = parseFloat(splitAccelerometerData[2]);
					var finalAccelerometerData = JSON.stringify({sno :gyroscopeCount .toString(), gatewayId : uniqueGatewayId,
					sensorId : " accelerometer-"+splitAccelerometer[1], dataType :splitAccelerometer[2],dataUnit:splitAccelerometer[3],
					accelerometer_x:accelerometerX, accelerometer_y:accelerometerY, accelerometer_z:accelerometerZ, time : currentTime})

					mqttRelayDataSend (finalAccelerometerData,forwardingRule);
					break;
			
				case "topic/sensor/data/magnetometer":

					magnetometerCount ++;
					var now = moment();
					var currentTime = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
			
					var magnetometer = data.toString();
					var splitMagnetometer = magnetometer.split("-");
					var  magnetometerData = splitMagnetometer[0];
					var splitMagnetometerData = magnetometerData.split(",");
					var magnetometerX = parseFloat(splitMagnetometerData[0]);
					var magnetometerY = parseFloat(splitMagnetometerData[1]);
					var magnetometerZ = parseFloat(splitMagnetometerData[2]);
					var finalMagnetometerData = JSON.stringify({sno :gyroscopeCount .toString(), gatewayId : uniqueGatewayId,
						sensorId : " magnetometer-"+splitMagnetometer[1], dataType :splitMagnetometer[2],dataUnit:splitMagnetometer[3],
						magnetometer_x: magnetometerX, magnetometer_y: magnetometerY, magnetometer_z: magnetometerZ, time : currentTime})

					mqttRelayDataSend (finalMagnetometerData,forwardingRule);
					break;	
		
				case "topic/sensor/data/ambientTemperature":
				case "topic/sensor/data/objectTemperature":

					tempCount ++;
					var now = moment();
					var currentTime = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
			
					var tempData = data.toString();
					var splitTemp = tempData.split("-");
					var sensorDataType = splitTemp[2];
					var sensorData = parseFloat(splitTemp[0]);
					var finalTempData = {sno : tempCount, gatewayId : uniqueGatewayId,
						sensorId : sensorDataType+"-"+splitTemp[1], dataType : sensorDataType, dataUnit: splitTemp[3],
						time : currentTime}
					finalTempData[sensorDataType] = sensorData;

					mqttRelayDataSend (JSON.stringify(finalTempData),forwardingRule);
					break;
/*	
				case "topic/sensor/data/objectTemperature":

					tempCount ++;
					var now = moment();
					var currentTime = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
			
					var tempData = data.toString();
					var splitTemp = tempData.split("-");
					var tempData = parseFloat(splitTemp[0]);
					var finalTempData = JSON.stringify({sno : {N: tempCount}, gatewayId : {S: uniqueGatewayId}, 
						sensorId : {S: "objTemp-"+ splitTemp[1]}, dataType : {S: splitTemp[2]},dataUnit: {S: splitTemp[3]},
						objectTemp : {N: tempData}, time : {S: currentTime}})

					mqttRelayDataSend (finalTempData,forwardingRule);
					break;
*/
			
				case "topic/sensor/data/pressure":

					pressureCount ++;
					var now = moment();
					var currentTime = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
			
					var barometricPressure = data.toString();
					var splitBarometricPressure = barometricPressure.split("-");
					var barometricPressureData = parseFloat(splitBarometricPressure[0]);
					var finalPressureData = JSON.stringify({sno :pressureCount .toString(), gatewayId : uniqueGatewayId,
						sensorId : "pressure-"+splitBarometricPressure[1], dataType :splitBarometricPressure[2],dataUnit:splitBarometricPressure[3],
						pressure:barometricPressureData, time : currentTime})

					mqttRelayDataSend (finalPressureData,forwardingRule);
					break;

			

				case "topic/sensor/data/humidity":

					humidCount ++;
					var now = moment();
					var currentTime = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
			
					var humidData = data.toString();
					var splitHumid = humidData.split("-");
					var humidData = parseFloat(splitHumid[0]);
					var finalHumidData = JSON.stringify({sno :humidCount.toString(), gatewayId : uniqueGatewayId,
						sensorId : "humid-"+ splitHumid[1], dataType : splitHumid[2],dataUnit: splitHumid[3],
						humidity :humidData, time : currentTime})

					mqttRelayDataSend (finalHumidData,forwardingRule);
					break;
				case "topic/sensor/data/luxometer":

					luxometerCount ++;
					var now = moment();
					var currentTime = now.tz("America/New_York").format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
			
					var luxometer = data.toString();
					var splitLuxometer =luxometer.split("-");
					var luxometerData = splitLuxometer[0];
					var finalLuxometerDataData = JSON.stringify({sno :gyroscopeCount .toString(), gatewayId : uniqueGatewayId,
						sensorId : "luxometer-"+splitLuxometer[1], dataType :splitLuxometer[2],dataUnit:splitLuxometer[3],
						luxometer: luxometerData, time : currentTime})

					mqttRelayDataSend (finalLuxometerDataData,forwardingRule);
					break;	
				case "topic/sensor/data/so2":
				case "topic/sensor/data/no2":
				case "topic/sensor/data/co2":
				case "topic/sensor/data/nh3":
				case "topic/sensor/data/co":
				
					var airQualityData = data.toString();
					var splitAirQuality = airQualityData.split("-");
					var sensorDataType = splitAirQuality[2];
					var airQualityData = parseFloat(splitAirQuality[0]);
					var finalAirQualityData = {sno : tempCount, gatewayId : uniqueGatewayId,
						sensorId : sensorDataType+"-"+splitAirQuality[1], dataType : sensorDataType, dataUnit: splitAirQuality[3],
						time : currentTime}
					finalAirQualityData[sensorDataType] = airQualityData;

					mqttRelayDataSend (JSON.stringify(finalAirQualityData),forwardingRule);
					break;
				default:
					log.error ("unknown topic : " + topic);
					break;
			}
		});
	}
	if (callback) {
		callback();
	}
}

var mqttCloudClientInit = function (callback)
{
   log.debug('MQTT cloud client init');

   if (fs.existsSync('/etc/securiot.in/config.txt')) {

      cloudServerType = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.ServerType

      switch (cloudServerType) {

      case "azure":
         log.info('AZURE Cloud Server');
         iotHubName       = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AzureConfig.IoTHub;;
         protocol         = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AzureConfig.Protocol;
         deviceId         = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AzureConfig.DeviceId;
         accessKey        = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AzureConfig.AccessKey;
         connectionString = 'HostName='+iotHubName+'.azure-devices.net;DeviceId='+deviceId+';SharedAccessKey='+accessKey;
         clientFromConnectionString = require('azure-iot-device-'+protocol).clientFromConnectionString;

         cloudClient = clientFromConnectionString(connectionString);
         Message = azureIoT.Message;
         cloudClient.open (azureConnectCallback);
         break;

      case "AWS":
         log.info('AWS Cloud Server');
         iotHubName  = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AWSConfig.IoTHub;
         protocol    = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AWSConfig.Protocol;
         deviceId    = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AWSConfig.DeviceId;
         accessKey   = parsedConfigData.gatewaySaurabhpi.ServerConfig.data.AWSConfig.AccessKey;
         cloudClient = awsIoT.thingShadow ({
            keyPath: "/etc/ssl/certs/"+deviceId+".private.key",
            certPath: "/etc/ssl/certs/"+deviceId+".cert.pem",
            caPath: "/etc/ssl/certs/"+accessKey,
            clientId: deviceId,
            protocol: protocol,
            host: iotHubName});

         awsBaseTopic = 'SecurIoT.in/thing/' + deviceId;

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

var mqttRelayDataSend = function (finalData,forwardingRule)
{
   log.trace("data from local broker: "+finalData);

   for (var rule in forwardingRule) {
	   
      switch (forwardingRule[rule].match.data_type) {
		
      case "any":

         switch(forwardingRule[rule].then.send_to) {

         case "cloud":
            sendToCloud(finalData);
            return;

         case "analytics":

            //sendToAnaltics(dataForForwarding);
            return;

         case "daisy-chained":
            return;

         }
         break;

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
         break;
      }
   }
}

var sendToCloud = function(sensorData, callback)
{
	switch (cloudServerType) {

		case "azure":
			var message = new Message (sensorData);
			log.trace("sensorData to azure cloud: "+JSON.stringify(message));
			cloudClient.sendEvent(message, function (err) {

				if (err) {

					if (callback) {
						callback(err);
					} else {
						log.error ("sensor data send failed : " + err.toString());
						pushDataToStorage(sensorData);
					}
					cloudStateOn();
				} else {

					if (callback) {
						callback(err);
					}
					cloudStateOff();
					log.trace ("Message sent : " + message);
				}
			});
			break;

		case "AWS":
			awsSensorDataTopic = awsBaseTopic+'/topic/sensor/data';
			cloudClient.publish(awsSensorDataTopic, JSON.stringify (sensorData));
			log.debug("Topic: " + awsSensorDataTopic + " Message: " + sensorData);
			break;
	}
}

var pushDataToStorage = function (sensorData)
{
   log.trace ('moving data to offline storage');

   getCreateOfflineDirectory (function (directory) {

      var file = directory + '/sensorOffline.json';

      writeOneTuple(file, sensorData);
   });
}

var getCreateOfflineDirectory = function (callback)
{
   // store data in file "sensorOffline.json" in bucket based on YYYY/MM/DD/HH format

   var date = require('date-and-time');
   var now = new Date();

   var currentTime = date.format(now, 'YYYY/MM/DD HH:mm A [GMT]Z', true);
   var splitCurrentTime = currentTime.split("/");

   var year = splitCurrentTime[0];
   var month = splitCurrentTime[1];

   var getDateHour = splitCurrentTime[2].split(" ");
   var date = getDateHour[0];

   var getHour = getDateHour[1].split(":");
   var hour = getHour[0];

   var directory = '/var/log/' + BASE_MODULE + '.in/' + year + '/' + month + '/' + date + '/' + hour;

   // create the direcotry
   if (!fs.existsSync(directory)) {

       var cmd = 'sudo mkdir -p ' + directory;
       exec (cmd, function () {
          callback (directory);
       });
    } else {
       callback (directory);
    }
}

var writeOneTuple = function (file, sensorData)
{
    var cmd = 'sudo cat ' + sensorData + ' >> ' + file;

    if (!fs.existsSync(file)) {

        redisClient.hget(OFFLINE_DATA_FILE_TAG, file, function(err, res) {

           if (err || (res === null)) {

               redisClient.hmset(OFFLINE_DATA_FILE_TAG, file, file,
               
                  function(err, res) {
                    if (err) {
                       log.debug('offline file entry add fail, ' + file);
                    }
               });
           }
        });
    }

    exec (cmd, function () {
       log.trace ("Message stored offline");
    });
}

var updateSensorStatus = function (sensorStatus)
{
	switch (cloudServerType) {
		case "azure":
			azureDT.updateSensorStatus (sensorStatus);
			break;
		case "AWS":
			awsTS.updateSensorStatus (sensorStatus);
			break;
	}
}

var updateSystemConfig = function (configId)
{
	switch (cloudServerType) {
		case "azure":
			azureDT.updateSystemConfig (configId);
			break;
		case "AWS":
			awsTS.updateSystemConfig (configId);
			break;
	}
}

var updateSystemStatus = function (systemStatus)
{
	switch (cloudServerType) {
		case "azure":
			azureDT.updateSystemStatus (systemStatus);
			break;
		case "AWS":
			awsTS.updateSystemStatus (systemStatus);
			break;
	}
}

var updateRemoteCmdStatus = function (cmd, status, msg, source)
{
	// io.emit to gatewayUI
	io.emit(cmd, { action: status, status: msg});
	// update Azure Device Twin or AWS Thing Shadow
	switch (cloudServerType) {
		case "azure":
			azureDM.updateRemoteCmdStatus (cmd, status, msg, source);
			break;
		case "AWS":
			awsDM.updateRemoteCmdStatus (cmd, status, msg, source);
			break;
	}
}

var sendRemoteCmdResponse = function (response, status)
{
	switch (cloudServerType) {
		case "azure":
			azureDM.sendRemoteCmdResponse (response, status);
			break;
		case "AWS":
			//awsDM.sendRemoteCmdResponse (response, status);
			break;
	}
}

module.exports.updateSensorStatus    = updateSensorStatus;
module.exports.sendToCloud           = sendToCloud;
module.exports.updateSystemConfig    = updateSystemConfig;
module.exports.updateSystemStatus    = updateSystemStatus;
module.exports.mqttCloudClientInit   = mqttCloudClientInit;
module.exports.mqttLocalClientInit   = mqttLocalClientInit;
module.exports.sendRemoteCmdResponse = sendRemoteCmdResponse;
module.exports.updateRemoteCmdStatus = updateRemoteCmdStatus;
