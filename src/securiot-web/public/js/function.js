//Globals
var user          = {};
var sensor        = {};
var company       = {};
var locations       = {};

var uluru, map, marker;

var userBaseUrl   = '';
var loginBaseUrl  = '';

var zoneArr   = [];
var selectIds = [];

var getDeviceName = function(cb)
{
   $.ajax({

      method: "GET",
      url: '/api/mgmt/deviceName'
   }).done(function(data) {

      console.log(data);
      cb(data.deviceName);

   }).fail(function(data) {

      console.log(data);
   });
}

//Init function of login page
var loginInit = function()
{
   getDeviceName(function(devName) {

      console.log('Device Id: ' + devName);

      if (devName == "DHB-ABCDEFGHIJ-YY-XXXXX") {

         var devName = prompt('Please enter device name: ', 'SIOT-');

         if (devName == null) {
            window.location.reload();

         } else if (devName.search(/SIOT[-/]\c{10}[-/]\d{2}[-/]\d{5}$/) >= 0) {

            //send to server
            $.ajax({

               method: "POST",
               url: '/api/mgmt/deviceName',
               data: {'deviceName' : devName}
            }).done(function() {

               window.location.reload()
            }).fail(function() {

               window.location.reload()
            });

         } else {
            window.location.reload();
         }
      }
   });


   userDoc = window.localStorage.getItem('user');

   if (userDoc === null) {

      window.localStorage.removeItem('user');
      window.location.href = "index.html";

   } else {
      login = login('dashboard.html');
   }
}

var login = function(destination)
{
   var userName;
   var passWord;

   if (!jQuery.isEmptyObject(user)) {

      userName = user._id;
      passWord = user.password;
   } else {

      userName = $("#username").val();
      passWord = $("#password").val();
   }
	
	
   var loginData = {user: userName, password: passWord};
        

   //Perform User Fetch
   $.ajax({

      type: "POST",
      url: '/api/mgmt/login'
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify(loginData)
   }).done(function(data) {

      console.log(data);

      loginHandler(userName, passWord, destination);
   });
}

var loginHandler = function(userName, passWord, destination)
{
   var get_url = '/api/mgmt/login/' + userName;

   $.ajax({

      method: 'GET',
      url: 'get_url
   }).done(function(data) {

      console.log(data)

      var userDoc = data;
      delete userDoc._rev;

      //clean up localstorage information
      window.localStorage.removeItem('user');

      if (!userDoc) {

         console.log('invalid user data');
         window.location.href = "index.html";
         return;
      }

      //store user data in local storage
      window.localStorage.setItem('user', JSON.stringify(userDoc));

      get_url = /api/mgmt/location/';

      $.ajax({

         method: 'GET',
         url: get_url
      }).done(function(locationData) {

         console.log(locationData);
       
         window.localStorage.setItem('location', JSON.stringify(locationData));
       
         $.ajax({
       
            method: 'POST',
            url: '/api/mgmt/refresh'
         }).done(function(data) {

            if (data.success) {
                window.location.href = destination;
            }
         });
      });
   });
}

var logout = function()
{
   window.localStorage.removeItem('user');
   window.localStorage.removeItem('location');

   // point to login page
   window.location.href = "index.html";
}

var showUser = function()
{
   var user = JSON.parse(window.localStorage.getItem('user'));
   var loc  = JSON.parse(window.localStorage.getItem('location'));

   console.log('user: ' + user);
   console.log('GPS location: ' + loc);

   if (user) {
      $("#user").text(user.id);
   }

   // get location
   if (loc) {

      var locString = loc.city + ',' + loc.state + ',' + loc.country;

      $.ajax({
         method: 'GET',
         url: 'http://maps.google.com/maps/api/geocode/json?address=' + locString + '&sensor=false'
      }).done(function(data) {

         // take some default, to start with
         var pos = { lat: 12.963778, lng: 77.712111 };

         if (data.status === 'OK') {
            pos = { lat: data.results[0].geometry.loc.lat, lng: data.results[0].geometry.loc.lng };
         }

         map map = new google.maps.Map(document.getElementById('map'), { zoom: 5, center: pos});

         marker = new google.maps.Marker({ position: pos, map: map });
      });
   }
}

var getLatestSwVersion = function()
{
   document.getElementById("swVersionBtn").style.display = 'none';

   $.ajax({

      method: 'POST',
      url: '/api/mgmt/latestSwVersionId'
   }).done(function(data) {

      $('#latestSwVersionId').text(data.latestSwVersionId);
   });

   socket = io.connect(window.location.origin, {
        'reconnect': true,
        'reconnection delay': 500,
        'max reconnection attempts': 10000});

   socket.on('swVersionId',function(data) {

      if (data.status === 'fetching') {

         $("#latestSwVersionId").text('fetching latest version information');
      }
   });
}

var validateUser = function()
{
   if (window.localStorage.getItem('user') === null) {

      window.location.href = "index.html";
      return;
   }
   showUser();
}

var hostNameUpdate = function()
{
   $.ajax({

       method: 'POST',
       url: '/api/mgmt/hostName',
       data: { hostname: $('#hostName').val() }
   }).done(function(data) {

      if (data.success) {

         alert('host name updated')
         window.location.reload();
      } else {

         alert('failed')
         window.location.reload();
      }
   });
}

var softwareUpgradeConfirm = function()
{
   var upgradeSwVersionId = $('#upgradeSwVersionId').val();

   console.log('upgrade to ' + upgradeSwVersionId);

   $("#softwareUpgradeBtn").attr("disabled","true");

   $.ajax({

      method:'GET',
      url:'/api/mgmt/upgrade/status'

   }).done(function(data) {

      if (data.success != 0) {
          alert('a software upgrade is currently in progress...');
          return;
      }

      $("#softwareUpgradeBtn").text('upgrading...');

      $.ajax({
         method: 'POST',
         url: '/api/mgmt/upgrade/' + upgradeSwVersionId
      }).done(function() {

         console.log(upgradeSwVersionId + ' software upgrade done!');;

         $("#softwareUpgradeBtn").text('upgrading software...');

      }).fail(function() {

         alert('software upgrade to ' + upgradeSwVersionId + ' failed!');
      });

   }).fail(function() {

      alert('upgrade status get failed!');
   });
}

// restart the datahub services
var softwareRestartConfirm = function()
{
   $.ajax({

      method: 'POST',
      url: '/api/mgmt/softwareRestart/'
   }).done(function(data) {

      if (!data.success) {

         alert('software restart failed');
         return;
      } else {

         alert('software restart done');
      }

      setTimeout(function() {

         login('dashboard.html');
      }, 3000);

   }).fail(function() {

      alert('software restart failed');
   });
}

var hardwareRestartConfirm = function()
{
   $.ajax({

       method: 'POST',
       url: '/api/mgmt/hardwareRestart/',
   }).done(function() {

      console.log("system restart done!");
      alert('system restart done!');

      setTimeout(function() {

         login('dashboard.html');
      }, 60000);
   });
}

var updateInit = function()
{
   var hwInfo;
   var swInfo;

   $.ajax({
      method: 'GET',
      url: '/api/mgmt/swVersionId'
   }).done(function(data) {
      $("#swVersionId").text(data.swVersionId);
   });

   $.ajax({
      method: 'GET',
      url: '/api/mgmt/hwVersionId'
   }).done(function(data) {
      $("#hwVersionId1").text(data.hwVersionId);
   });

   $.ajax({
      method: 'GET',
      url: '/api/mgmt/hwDesc'
   }).done(function(data) {
      $("#hwDescription").text(data.hWDesc);
   });

   $.ajax({
       method: 'GET',
       url: '/api/mgmt/kernelVersion'
   }).done(function(data) {
       $("#kernelVersion").text(data.kernelVersion);
   });

   $.ajax({
      method: 'GET',
      url: '/api/mgmt/firmwareVersion'
   }).done(function(data) {
      $("#firmwareVersion").text(data.firmwareVersion);
   });

   $.ajax({
      method: 'GET',
      url: '/api/mgmt/wlanMacAddr'
   }).done(function(data) {
      $("#wlanMacAddr").text(data.wlanMacAddr);
   });

   $.ajax({
      method: 'GET',
      url: '/api/mgmt/ethMacAddr'
   }).done(function(data) {
      $("#ethMacAddr").text(data.ethMacAddr);
   });


   hwInfo = "<div class='panel panel-color panel-primary'> \
            <div class='panel-heading'> \
            <h3 class='panel-title'>Hardware Information</h3>\
            </div> </div>";

   $("#hwInfo").append(hwInfo);

   swInfo = "<div class='panel panel-color panel-primary'> \
            <div class='panel-heading'> \
            <h3 class='panel-title'>Software Information</h3>\
            </div></div>";
   $("#swInfo").append(swInfo);

   $.ajax({

      method:'GET',
      url:'/api/mgmt/upgrade/status'
   }).done(function(data){

      if (data.success) {

         $("#softwareUpgradeBtn").removeAttr('disabled');
      } else {

         $("#softwareUpgradeBtn").text('Updating');
         $("#softwareUpgradeBtn").attr("disabled","true")
      }
   });

   socket = io.connect(window.location.origin, {
             'reconnect': true,
             'reconnection delay': 500,
             'max reconnection attempts': 10000});

   socket.on('update',function(data) {

      $('#updateStats').text(data.status);

      if (data.status === "failed") {
          $('#updateStats').append('...');
          $("#softwareUpgradeBtn").removeAttr('disabled');
          setTimeout(function(){window.location.reload()},5000);
      }

      if (data.status === "complete"){
          $('#updateStats').append('...reloading.')
          $("#softwareUpgradeBtn").removeAttr('disabled');
          setTimeout(function(){window.location.reload()},20000);
      }
   });
}

var setLogLevel = function (logSettings)
{
   $.ajax({

      method:'POST',
      url:'/api/mgmt/loglevel',
      data:{level:$('#logLevel_' + which).val(), which: logSettings}

   }).done(function() {

      alert('done');
   }).fail(function() {

      alert('set log level failed');
   });
}
