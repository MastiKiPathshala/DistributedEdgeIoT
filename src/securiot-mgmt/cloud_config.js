/*
 * @brief: cloud config module
 *
 * @authors: Saurabh Singh, Prosenjit Pal, Srinibas Maharana
 *
 * @date: 10 July 2017 First version of config handler code
 *
 * config handler for publishing to sensor service modules
 *
 * Internal MQTT topic (between processes within SecurIoT gateway)
 *
 * topic/sensor/config - config messages between mgmt and other sensor service modules
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

var mqttAddTopic     = "topic/sensor/config/add";
var mqttDeleteTopic  = "topic/sensor/config/delete";
var mqttRequestTopic = "topic/sensor/config/request";
var mqttUpdateTopic  = "topic/sensor/config/update";

exports.cloudConfigInit = function()
{
		if (typeof localClient != "undefined") {
			localClient.subscribe(mqttRequestTopic);
		}

		publishSensorConfig();
}

exports.cloudConfigHandler = function(topic, data)
{

	// Received config update request from sensor services
	if ((topic === null) || (topic === mqttRequestTopic)) {

		publishSensorConfig();
	} else {

		log.error ("unknown topic : " + topic);
	}
}

exports.publishNewConfig = function(data)
{
	publishSensorConfig(data);
}

var publishSensorConfig = function(data)
{
	var localFrequency = 0;
	var cloudFrequency = 0;

	if (data) {
	   log.debug('publishing sensor config:' + JSON.stringify(data.properties.desired));
	} else {
	   log.debug('publishing sensor config');
	}

	if (fs.existsSync('/etc/securiot.in/config.txt')) {

		var localConfigFile   = fs.readFileSync('/etc/securiot.in/config.txt');
		var parsedLocalConfig = JSON.parse(localConfigFile);
	}

	if (typeof data != "undefined" && (data != null)) {

		var cloudConfigData   = data.properties.desired;
		var parsedCloudConfig = cloudConfigData;
	}

	if (typeof localClient != "undefined") {

		/* delete old sensors */
		if (typeof parsedLocalConfig != "undefined" ) {

			for (var idx in parsedLocalConfig.telemetryConfig) {

				if (idx === 'frequency') {
					localFrequency = parsedLocalConfig.telemetryConfig[idx];
				} else {

					var found = false;
					var localSensorConfig = parsedLocalConfig.telemetryConfig[idx];

					if (typeof parsedCloudConfig != "undefined") {

						for (var jdx in parsedCloudConfig.telemetryConfig) {

							if (jdx === 'frequency') {

								cloudFrequency = parsedCloudConfig.telemetryConfig[jdx];
							} else {

								if (idx == jdx) {
									found = true;
								}
							}
						}
					}

					if (found === false) {
						log.debug('delete sensor:' + JSON.stringify(localSensorConfig));
						localClient.publish(mqttDeleteTopic, JSON.stringify (localSensorConfig));
					}
				}
			}
		}

		/* next add new sensors */
		if (typeof parsedCloudConfig != "undefined" ) {

			for (var idx in parsedCloudConfig.telemetryConfig) {

				if (idx != 'frequency') {

					var found = false;
					var cloudSensorConfig = parsedCloudConfig.telemetryConfig[idx];

					if (typeof parsedLocalConfig != "undefined" ) {

						for (var jdx in parsedLocalConfig.telemetryConfig) {

							if (jdx != 'frequency') {

								if (idx == jdx) {
									found = true;
								}
							}
						}
					}

					if (found === false) {
						log.debug('add sensor:' + JSON.stringify(cloudSensorConfig));
						localClient.publish(mqttAddTopic, JSON.stringify (cloudSensorConfig));
					}
				}
			}
		}

		/* update sensor properties */
		if ((typeof parsedCloudConfig != "undefined") &&
			 (typeof parsedLocalConfig != "undefined")) {

			for (var idx in parsedCloudConfig.telemetryConfig) {

				if (idx != 'frequency') {
					var cloudSensorConfig = parsedCloudConfig.telemetryConfig[idx];

					for (var jdx in parsedLocalConfig.telemetryConfig) {

						var localSensorConfig = parsedLocalConfig.telemetryConfig[jdx];

						if ((jdx != 'frequency') && (idx == jdx) &&
							 (cloudSensorConfig.frequency != localSensorConfig.frequency)) {

							log.debug('update sensor:' + JSON.stringify(cloudSensorConfig));
							localClient.publish(mqttUpdateTopic, JSON.stringify (cloudSensorConfig));
						}
					}
				}
			}
		}
	}
}
