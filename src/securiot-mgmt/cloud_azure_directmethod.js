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

var exec = require('child_process').exec;

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

exports.onFirmwareUpdate = function(request, response) {

  // Respond the cloud app for the direct method
  response.send(200, 'FirmwareUpdate started', function(err) {
    if (!err) {
      console.error('An error occured when sending a method response:\n' + err.toString());
    } else {
      log.debug('Response to method \'' + request.methodName + '\' sent successfully.');
    }
  });

  // Get the parameter from the body of the method request
  var fwPackageUri = request.payload.fwPackageUri;

  // Obtain the device twin
  cloudClient.getTwin(function(err, twin) {
    if (err) {
      console.error('Could not get device twin.');
    } else {
      log.debug('Device twin acquired.');

      // Start the multi-stage firmware update
      waitToDownload(twin, fwPackageUri, function() {
        downloadImage(twin, fwPackageUri, function(imageData) {
          applyImage(twin, imageData, function() {});    
        });  
      });

    }
  });
}

exports.onReboot = function(request, response) {

    // Respond the cloud app for the direct method
    response.send(200, 'Reboot started', function(err) {
        if (!err) {
            console.error('An error occured when sending a method response:\n' + err.toString());
        } else {
            log.debug('Response to method \'' + request.methodName + '\' sent successfully.');
        }
    });

    // Report the reboot before the physical restart
    var date = new Date();
    var patch = {
        iothubDM : {
            reboot : {
                lastReboot : date.toISOString(),
            }
        }
    };

    // Get device Twin
    cloudClient.getTwin(function(err, twin) {
        if (err) {
            console.error('could not get twin');
        } else {
            log.debug('twin acquired');
            twin.properties.reported.update(patch, function(err) {
                if (err) throw err;
                log.debug('Device reboot twin state reported')
            });  
        }
    });

	child = exec('sudo reboot', function (error, stdout, stderr) {
		if (error != null) {
			log.debug('exec error: ' + error);
		} else {
    		log.debug('Rebooting!');
		}
	});
};
