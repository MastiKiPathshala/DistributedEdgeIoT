/*************************************************************************
 *
 * $file: cloud_aws_directmessage.js
 *
 * @brief: Handles direct messages from AWS
 *
 * @author: Prosenjit Pal
 *
 * @date: 07 June 2017 First version of AWS Direct Message handler code
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/

var exec = require('child_process').exec;
var system = require ('./routes/system');

var messageCallback = function(topic, payload)
{
	log.debug ('message arrived on topic ', topic);
	if (topic == awsRemoteConfigTopic) {
		var remoteConfigCmd = JSON.parse(payload);
 		log.debug ("RemoteConfig - Method: " + remoteConfigCmd.method + ", Payload: " + JSON.stringify (remoteConfigCmd.payload));
		switch (remoteConfigCmd.method) {
			case "firmwareUpdate":
			break;
			case "reboot":
				updateRebootStatus ("AWS IoT triggered reboot");
				system.restartSystem ();
			break;
			case "factoryReset":
			break;
			case "remoteDiagnostic":
			break;
		}
	}
}

var updateRebootStatus = function (reasonStr)
{
	var date = new Date();
	var myThingState = {
	state: {
        reported: {
			SystemStatus : {
				reboot: {
					lastReboot: date.toISOString(),
					rebootReason: reasonStr
				}
			}
		}
	}
	};
	cloudClientToken = cloudClient.update (iotHubName, myThingState);

	if (cloudClientToken === null) {
		log.debug ("Failed to update System status, AttemptCount: " + updateAttemptCount);
		currentTimeout = setTimeout (function () {
			exports.updateSystemStatus (systemStatus);
		}, 10000);
	} else {
		clientTokenStack.push (cloudClientToken);
	}
}

module.exports.messageCallback  = messageCallback;
module.exports.updateRebootStatus  = updateRebootStatus;
