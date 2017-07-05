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

var initTelemetryConfigChange = function(twin) {
	var currentTelemetryConfig = twin.properties.reported.telemetryConfig;
	currentTelemetryConfig.pendingConfig = twin.properties.desired.telemetryConfig;

	var patch = {
		telemetryConfig: currentTelemetryConfig,
		systemConfig: {
			configChange: {
				status: "Pending",
				requestedConfigId: twin.properties.desired.$version
			}
		}
	};
	twin.properties.reported.update(patch, function(err) {
		if (err) {
			log.debug('Could not report properties');
		} else {
			log.debug('Reported pending config change: ' + JSON.stringify(patch));
			//Update config.txt with this config
			// Publish this config change to internal MQTT system
			localClient.publish ('topic/sensor/config', JSON.stringify(currentTelemetryConfig.pendingConfig));
			completeTelemetryConfigChange(twin);
		}
	});
 }

var completeTelemetryConfigChange =  function(twin) {
	var currentTelemetryConfig = twin.properties.reported.telemetryConfig;
	var configId = twin.properties.reported.systemConfig.configChange.requestedConfigId;
	var newTelemetryConfig = currentTelemetryConfig.pendingConfig;
	delete currentTelemetryConfig.pendingConfig;
	currentTelemetryConfig = newTelemetryConfig;

	var patch = {
		telemetryConfig: currentTelemetryConfig,
		systemConfig: {
			currentConfigId: configId,
			configChange: {
				status: "Success",
				requestedConfigId: configId
			}
		}
	};
	patch.telemetryConfig.pendingConfig = null;

	twin.properties.reported.update(patch, function(err) {
		if (err) {
			console.error('Error reporting properties: ' + err);
		} else {
			log.debug('Reported completed config change: ' + JSON.stringify(patch));
		}
	});
};

exports.updateSensorStatus = function (sensorStatus) {
		 
	var status = JSON.parse(sensorStatus)

	if (typeof cloudClient != "undefined") {

		cloudClient.getTwin (function (err, twin) {
			if (err) {
				log.error ("Azure Client failed to get twin : " + err);
			} else {
				var patch = {
					SensorStatus: JSON.stringify(status)
					
				};
				
				twin.properties.reported.update(patch, function(err) {
					if (err) {
						log.error('Sensor Status not updated : ' + err);
					} else {
						log.debug('Sensor Status updated: ' + JSON.stringify(patch));
					}
				});
			}
		});
	}
}

exports.updateSystemConfig = function (configId) {

	if (typeof cloudClient != "undefined") {

		cloudClient.getTwin (function (err, twin) {
			if (err) {
				log.error ("Azure Client failed to get twin : " + err);
			} else {
				var patch = {
					systemConfig: {
						currentConfigId: configId
					},
					telemetryConfig: {
						sendFrequency: "24h"
					}
				};
				twin.properties.reported.update(patch, function(err) {
					if (err) {
						log.error('System Config Id not updated : ' + err);
					} else {
						log.debug('System Config Id updated: ' + JSON.stringify(patch));
					}
				});
			}
		});
	}
}

exports.updateSystemStatus = function (systemStatus) {

	if (typeof cloudClient != "undefined") {

		cloudClient.getTwin (function (err, twin) {
			if (err) {
				log.error ("Azure Client failed to get twin : " + err);
			} else {
				var patch = {
					SystemStatus: {
						softwareVersion: systemStatus.softwareVersion,
						kernelVersion: systemStatus.kernelVersion,
						hardwareVersion: systemStatus.hardwareVersion,
						firmwareVersion: systemStatus.firmwareVersion,
						manufacturer: systemStatus.manufacturer,
						sensorsAttached: systemStatus.sensorsAttached,
						lastBootup: new Date()
					}
				};
				twin.properties.reported.update(patch, function(err) {
					if (err) {
						log.error('System Status not updated : ' + err);
					} else {
						log.debug('System Status updated: ' + JSON.stringify(patch));
					}
				});
			}
		});
	}
}

exports.onConfigChange = function(err, twin) {

	if (err) {
		console.error('Config change notification error: ' + err);
	} else {
		log.debug('Config change notification received');
		twin.on('properties.desired', function(desiredChange) {
			log.debug("Desired change: " + JSON.stringify(desiredChange));
			var currentConfig = twin.properties.reported.systemConfig;
			if (desiredChange.$version !== currentConfig.currentConfigId) {
				log.debug("Desired config: v" + desiredChange.$version + " different than current config: v" + currentConfig.currentConfigId);
				if (desiredChange.telemetryConfig) {
					initTelemetryConfigChange(twin);
				}
			} else {
				log.debug("Desired version: " + desiredChange.$version + " same as current config: " + currentConfig.currentConfigId);
			}
		});
	}
}
