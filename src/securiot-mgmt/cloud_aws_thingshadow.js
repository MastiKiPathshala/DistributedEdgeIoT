/*************************************************************************
 *
 * $file: <file name>
 *
 * @brief: <brief description of file>
 *
 * @author: <Author name and email>
 *
 * @date: <date with change log in reverse chronological order>
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/


updateAttemptCount = 0;
currentTimeout = null;
clientTokenStack =[];

exports.updateSensorStatus = function (sensorStatus) {
	var myThingState = {
		state: {
			reported: {
				SensorStatus: sensorStatus
			}
		}
	}
}

exports.updateSystemStatus = function (systemStatus) {
	updateAttemptCount++;

	var myThingState = {
	state: {
		reported: {
			SystemStatus: {
				softwareVersion: systemStatus.softwareVersion,
				kernelVersion: systemStatus.kernelVersion,
				hardwareVersion: systemStatus.hardwareVersion,
				firmwareVersion: systemStatus.firmwareVersion,
				manufacturer: systemStatus.manufacturer,
				sensorsAttached: systemStatus.sensorsAttached,
				lastBootup: systemStatus.lastBootup
			}
		}
	}
}

	cloudClientToken = cloudClient.update (deviceId, myThingState);

	if (cloudClientToken === null) {
		log.debug ("Failed to update System status, AttemptCount: " + updateAttemptCount);
		currentTimeout = setTimeout (function () {
			exports.updateSystemStatus (systemStatus);
		}, 10000);
	} else {
		clientTokenStack.push (cloudClientToken);
	}
};

exports.updateCallback = function (thingName, stateObject)
{
    log.debug('AWS thing Shadow update callback received');
    log.debug("Thing: " + thingName + ", State: " + JSON.stringify (stateObject));
};

exports.statusCallback = function (thingName, stat, clientToken, stateObject) {
	var expectedClientToken = clientTokenStack.pop();

	if (expectedClientToken === clientToken) {
		log.debug('got \'' + stat + '\' status on: ' + thingName);
	} else {
		log.debug('(status) client token mismtach on: ' + thingName);
	}
};
