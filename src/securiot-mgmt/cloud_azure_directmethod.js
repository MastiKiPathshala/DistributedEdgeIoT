/*************************************************************************
 *
 * $file: cloud_azure_directmethod.js
 *
 * @brief: Handles direct messages from AWS
 *
 * @author: Prosenjit Pal
 *
 * @date: 07 June 2017 First version of Azure Direct Message handler code
 *        05 July 2017 Updated with command details and command status details
 *
 * Azure commands for device management (C -> D):
 *
 * Software Upgrade
 * {"requestId":"<Request ID>", "methodName":"softwareUpgrade", "payload":{"fwPackageUri":"<SecurIoT Gateway software version>"}}
 *
 * Reset Configuration to Factory Default
 * {"requestId":"<Request ID>", "methodName":"configReset"[, "payload":{"cloudConfigReset":"true | false"}]}
 *
 * Send Remote Diagnostics
 * {"requestId":"<Request ID>", "methodName":"remoteDiagnostics"}
 *
 * Reboot
 * {"requestId":"<Request ID>", "methodName":"reboot"}
 *
 * Azure deviceTwin structure for device management command status
 * properties : {
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

var simulateDownloadImage = function(imageUrl, callback) {
  var error = null;
  var image = "[fake image data]";

  log.debug("Downloading image from " + imageUrl);

  callback(error, image);
}

var simulateApplyImage = function(imageData, callback) {
  var error = null;

  if (!imageData) {
    error = {message: 'Apply image failed because of missing image data.'};
  }

  callback(error);
}

var reportFWUpdateThroughTwin = function(twin, firmwareUpdateValue) {
  var patch = {
      iothubDM : {
        firmwareUpdate : firmwareUpdateValue
      }
  };

  twin.properties.reported.update(patch, function(err) {
    if (err) throw err;
    log.debug('twin state reported: ' + firmwareUpdateValue.status);
  });
};

var waitToDownload = function(twin, fwPackageUriVal, callback) {
  var now = new Date();

  reportFWUpdateThroughTwin(twin, {
    fwPackageUri: fwPackageUriVal,
    status: 'waiting',
    error : null,
    startedWaitingTime : now.toISOString()
  });
  setTimeout(callback, 4000);
};

var downloadImage = function(twin, fwPackageUriVal, callback) {
  var now = new Date();   

  reportFWUpdateThroughTwin(twin, {
    status: 'downloading',
  });

  setTimeout(function() {
    // Simulate download
    simulateDownloadImage(fwPackageUriVal, function(err, image) {

      if (err)
      {
        reportFWUpdateThroughTwin(twin, {
          status: 'downloadfailed',
          error: {
            code: error_code,
            message: error_message,
          }
        });
      }
      else {        
        reportFWUpdateThroughTwin(twin, {
          status: 'downloadComplete',
          downloadCompleteTime: now.toISOString(),
        });

        setTimeout(function() { callback(image); }, 4000);   
      }
    });

  }, 4000);
}

var applyImage = function(twin, imageData, callback) {
  var now = new Date();   

  reportFWUpdateThroughTwin(twin, {
    status: 'applying',
    startedApplyingImage : now.toISOString()
  });

  setTimeout(function() {

    // Simulate apply firmware image
    simulateApplyImage(imageData, function(err) {
      if (err) {
        reportFWUpdateThroughTwin(twin, {
          status: 'applyFailed',
          error: {
            code: err.error_code,
            message: err.error_message,
          }
        });
      } else { 
        reportFWUpdateThroughTwin(twin, {
          status: 'applyComplete',
          lastFirmwareUpdate: now.toISOString()
        });    

      }
    });

    setTimeout(callback, 4000);

  }, 4000);
}

var sendRemoteCmdResponse = function (cmd, response, status)
{
	response.send(200, status, function(err) {
		if (!err) {
			log.error('An error occured when sending a method response:\n' + err.toString());
		} else {
			log.debug('Response to method \'' + cmd + '\' sent successfully.');
		}
	});
}

var updateRemoteCmdStatus = function (cmd, status, msg, source)
{
	//
	// Expected status sequence :
	// One 'Started' status message at the start of the method execution
	// One or more 'In-Progress' status message during the method execution
	// One 'Completed' message at the end of successful completion of the method execution or
	// One 'Failed' message at the end of the method execution
	//
	// 'lastCmd' timestamp and 'cmdSource' will be updated only with first 'Started' message
	// 'cmdStatus' and 'cmdMsg' will be updated with every message
	//

	var date = new Date();
	var patch = {};
	patch.remoteCommand = {};
	patch.remoteCommand[cmd] = {
		cmdStatus: status,
		cmdMsg: msg,
	};
	if (status == 'Started') {
		patch.remoteCommand[cmd]['lastCmd'] = date.toISOString();
		patch.remoteCommand[cmd]['cmdSource'] = source;
	}

	// Get device Twin
	cloudClient.getTwin(function(err, twin) {
		if (err) {
            log.error("Remote command: " + cmd + ", twin get failed : " + err);
		} else {
			twin.properties.reported.update(patch, function(err) {
				if (err) {
					log.error ("Remote command: " + cmd + ", twin state update failed : " + err);
				} else {
					log.debug ("Remote command: " + cmd + ", twin state updated");
				}
			});
		}
	});
}

exports.onSoftwareUpgrade = function(request, response) {

	log.debug ("ID: " + request.requestId + ", Method: " + request.methodName + ", Payload: " + JSON.stringify(request.payload));

	// Get the software version to be upgraded
	var upgradeVersion = request.payload.fwPackageUri;

	updateRemoteCmdStatus ('softwareUpgrade', 'Started', 'Invoking software upgrade....', 'IoTHub requested softwareUpgrade');
	Upgrade.softwareUpgrade (upgradeVersion, response);
}

exports.onReboot = function(request, response)
{
	log.debug ("ID: " + request.requestId + ", Method: " + request.methodName + ", Payload: " + JSON.stringify(request.payload));
	sendRemoteCmdResponse ('reboot', response, {success: 'true', msg: 'Remote Reboot request received'});
	updateRemoteCmdStatus ('reboot', 'Started', 'Invoking device reboot ....', 'IoTHub triggered reboot');
	System.restartSystem ();
	updateRemoteCmdStatus ('reboot', 'In-Progress', 'Device rebooting ....', 'IoTHub triggered reboot');
};

exports.onConfigReset = function (request, response)
{
	log.debug ("ID: " + request.requestId + ", Method: " + request.methodName + ", Payload: " + JSON.stringify(request.payload));

	updateRemoteCmdStatus ('configReset', 'Started', 'Resetting config to factory-default....', 'IoTHub triggered configReset');
	// Get the config Reset flag
	if (request.payload == null) {
		System.resetConfig (null, response);
	} else {
		var configResteFlag = request.payload.cloudConfigReset;
		System.resetConfig (configResteFlag, response);
	}
}

exports.onRemoteDiagnostics = function (request, response)
{
	log.debug ("ID: " + request.requestId + ", Method: " + request.methodName + ", Payload: " + JSON.stringify(request.payload));
	updateRemoteCmdStatus ('remoteDiagnostics', 'Started', 'Received diagnostics bundle request', 'IoTHub triggered remoteDiagnostics');
	Diagnostics.sendRemoteDiagnostics (response);
}

module.exports.updateRemoteCmdStatus = updateRemoteCmdStatus;
module.exports.sendRemoteCmdResponse = sendRemoteCmdResponse;
