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

var initConfigChange = function(twin) {
     var currentTelemetryConfig = twin.properties.reported.telemetryConfig;
     currentTelemetryConfig.pendingConfig = twin.properties.desired.telemetryConfig;
     currentTelemetryConfig.status = "Pending";

     var patch = {
     telemetryConfig: currentTelemetryConfig
     };
     twin.properties.reported.update(patch, function(err) {
         if (err) {
             log.debug('Could not report properties');
         } else {
             log.debug('Reported pending config change: ' + JSON.stringify(patch));
             setTimeout(function() {completeConfigChange(twin);}, 60000);
         }
     });
 }

var completeConfigChange =  function(twin) {
     var currentTelemetryConfig = twin.properties.reported.telemetryConfig;
     currentTelemetryConfig.configId = currentTelemetryConfig.pendingConfig.configId;
     currentTelemetryConfig.sendFrequency = currentTelemetryConfig.pendingConfig.sendFrequency;
     currentTelemetryConfig.status = "Success";
     delete currentTelemetryConfig.pendingConfig;

     var patch = {
         telemetryConfig: currentTelemetryConfig
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
      console.error('could not get twin');
   } else {
      log.debug('retrieved device twin');
      twin.properties.reported.telemetryConfig = {
         configId: "1",
         sendFrequency: "24h"
      }
      twin.on('properties.desired', function(desiredChange) {
         log.debug("received change: "+JSON.stringify(desiredChange));
         var currentTelemetryConfig = twin.properties.reported.telemetryConfig;
         if (desiredChange.telemetryConfig &&desiredChange.telemetryConfig.configId !== currentTelemetryConfig.configId) {
            initConfigChange(twin);
         }
      });
   }
}
