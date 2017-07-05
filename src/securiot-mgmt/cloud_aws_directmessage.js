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
 * AWS topic for device management (C -> D):
 * SecurIoT.in/thing/<device ID>/topic/remoteconfig
 *
 * Commands are :
 *
 * Software Upgrade
 * {"method":"softwareUpgrade", "payload":{"fwPackageUri":"<SecurIoT Gateway software version>"}}
 *
 * Reset Configuration to Factory Default
 * {"method":"configReset"[, "payload":{"cloudConfigReset":"true | false"}]}
 *
 * Send Remote Diagnostics
 * {"method":"remoteDiagnostics"}
 *
 * Reboot
 * {"method":"reboot"}
 *
 * AWS thingShadow structure for device management command status
 * state : {
 * 	reported : {
 * 		remoteCommand : {
 * 			<remote command> : {
 * 				cmdStatus : "Started | In-Progress | Completed | Failed",
 * 				cmdMsg : "Last message related to command execution",
 * 				cmdSource : "Who triggered the command"
 * 				lastCmd : "Dat and Time of last remote command"
 *			}
 * 		}
 * 	}
 * }
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/

var exec = require('child_process').exec;
var System = require ('./routes/system');
var Diagnostics = require ('./routes/diagnostics');
var Upgrade = require ('./routes/upgrade');

var messageCallback = function(topic, payload)
{
	log.debug ('message arrived on topic ', topic);
	if (topic == awsRemoteConfigTopic) {
		var remoteConfigCmd = JSON.parse(payload);
 		log.debug ("RemoteConfig - Method: " + remoteConfigCmd.method + ", Payload: " + JSON.stringify (remoteConfigCmd.payload));
		switch (remoteConfigCmd.method) {
			case "softwareUpgrade":
				// Get the software version to be upgraded
				var upgradeVersion = remoteConfigCmd.payload.fwPackageUri;

				updateRemoteCmdStatus ('softwareUpgrade', 'Started', 'Invoking software upgrade....', 'AWS IoT requested softwareUpgrade');
				Upgrade.softwareUpgrade (upgradeVersion, null);
			break;
			case "reboot":
				updateRemoteCmdStatus ('reboot', 'Started', 'Invoking device reboot ....', 'AWS IoT triggered reboot');
				System.restartSystem ();
				updateRemoteCmdStatus ('reboot', 'In-Progress', 'Device rebooting ....', '');
			break;
			case "configReset":
				updateRemoteCmdStatus ('configReset', 'Started', 'Resetting config to factory-default....', 'AWS IoT triggered configReset');
				// Get the config Reset flag
				if (remoteConfigCmd.payload == null) {
					System.resetConfig (null, null);
				} else {
					var configResteFlag = remoteConfigCmd.payload.cloudConfigReset;
					System.resetConfig (configResteFlag, null);
				}
				break;
			case "remoteDiagnostics":
				updateRemoteCmdStatus ('remoteDiagnostics', 'Started', 'Received diagnostics bundle request', 'AWS IoT triggered remoteDiagnostics');
				Diagnostics.sendRemoteDiagnostics (null);
			break;
		}
	}
}

var updateRemoteCmdStatus = function (cmd, status, msg, source)
{
	var date = new Date();
	var myThingState = {};
	myThingState.state = {};
	myThingState.state.reported = {};
	myThingState.state.reported.remoteCommand = {};
	myThingState.state.reported.remoteCommand[cmd] = {
		cmdStatus: status,
		cmdMsg: msg,
	}
	if (status == 'Started') {
		myThingState.state.reported.remoteCommand[cmd]['lastCmd'] = date.toISOString();
		myThingState.state.reported.remoteCommand[cmd]['cmdSource'] = source;
	}
	
	cloudClientToken = cloudClient.update (deviceId, myThingState);

	if (cloudClientToken === null) {
		log.debug ("Failed to update System status, AttemptCount: " + updateAttemptCount);
		currentTimeout = setTimeout (function () {
			exports.updateRemoteCmdStatus (cmd, status, msg, source);
		}, 5000);
	} else {
		clientTokenStack.push (cloudClientToken);
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
	cloudClientToken = cloudClient.update (deviceId, myThingState);

	if (cloudClientToken === null) {
		log.debug ("Failed to update System status, AttemptCount: " + updateAttemptCount);
		currentTimeout = setTimeout (function () {
			exports.updateRebootStatus (reasonStr);
		}, 5000);
	} else {
		clientTokenStack.push (cloudClientToken);
	}
}

module.exports.messageCallback  = messageCallback;
module.exports.updateRemoteCmdStatus  = updateRemoteCmdStatus;
