/*************************************************************************
 *
 * $file: ble_main.go
 *
 * @brief: BLE module code
 *
 * @author: Saurabh Singh
 *
 * @date: 13 June 2017 First version of BLE code with only sensorTag support
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/
package main

import (
	"github.com/muka/go-bluetooth/api"
	"github.com/muka/go-bluetooth/devices"
	logging "github.com/op/go-logging"
	"github.com/muka/go-bluetooth/emitter"
	"fmt"
	MQTT "github.com/eclipse/paho.mqtt.golang"
	//"reflect"
	//"encoding/json"
	"sync"
	"time"
)
var client MQTT.Client
var log = logging.MustGetLogger("examples")
var adapterID = "hci0"

func main(){

	SubscribeMqtt ()
	manager := api.NewManager()
	error := manager.RefreshState()
	if error != nil {
		panic(error)
	}
	
	SensorTag()
	
	//"A0:E6:F8:AD:23:04","24:71:89:BE:7F:81"
	
	/*var macArr = []string{"A0:E6:F8:AD:23:04","24:71:89:BE:7F:81"}
	for j := 0; j < 2; j++ {
		log.Debug("macarr: ", macArr[j])
		ConnectAndDisconnect(macArr[j])
	}
	wg.Wait()*/
}
func SensorTag() {

	//.....................AdapterExists..................................
	
	boo,err := api.AdapterExists("hci0") 
		if err != nil {
		panic(err)
	}
	log.Debug("AdapterExists: ",boo)

	//...................start discovery on adapterId hci0..................

	err = api.StartDiscoveryOn("hci0")
	if err != nil {
		panic(err)
	}
	// wait a moment for the device to be spawn
	time.Sleep(time.Second)
	//.....................get the list of discovered devices....................
	
	devarr,err := api.GetDevices()
	if err != nil {
		panic(err)
	}
	//log.Debug("devarr",devarr[0])
	len := len( devarr )
	log.Debug("length: ",len)
	//.....................get device properties.........(name,status-connected,paired,uuids,Address)..........
	
	for i := 0; i< len; i++ { 
		prop1,err := devarr[i].GetProperties()
		
			if err != nil {
				log.Fatal(err)
			}
		log.Debug("DeviceProperties -ADDRESS: ",prop1.Address)
		ConnectAndDisconnect(prop1.Address)
	}
	wg.Wait()
	
}

func ConnectAndDisconnect(tagAddress string){
	//wg.Wait()
	dev, err := api.GetDeviceByAddress(tagAddress)
	if err != nil {
		panic(err)
	}
	log.Debug("device (dev): ",dev)
	
	if dev == nil {
		panic("Device not found")
	}
	
	if !dev.IsConnected() {
		log.Debug("not connected")
		
		err = dev.Connect()
		if err != nil {
			log.Fatal(err)
		}
		/*
		err = dev.Pair()
		if err != nil {
			log.Fatal(err)
		}*/
		
		} else {
		
			/*
			//....pair device.....
			
			err = dev.Pair()
			if err != nil {
				log.Fatal(err)
			}*/
		
			log.Debug("already connected")
			/*
			//....disconnect device.........
			
			err = dev.Disconnect()
			if err != nil {
				log.Fatal(err)
			}*/
			
			//....close bus connection.........
			
			//api.ClearDevice(dev)
			
		}
		
		sensorTag, err := devices.NewSensorTag(dev)
		if err != nil {
			panic(err)
		}
		log.Debug("sensorTag: ",sensorTag)
		
		
		
		//.........getname returns sensorName.................
		
		name := sensorTag.Temperature.GetName()
		log.Debug("sensor name: ",name)
		
		name1 := sensorTag.Humidity.GetName()
		log.Debug("sensor name: ",name1)
		
		mpu := sensorTag.Mpu.GetName()
		log.Debug("sensor name: ",mpu)
		
		barometric := sensorTag.Barometric.GetName()
		log.Debug("sensor name: ",barometric)
		
		luxometer:= sensorTag.Luxometer.GetName()
		log.Debug("sensor name: ",luxometer)
		//................Enable..............................
		
		/*err = sensorTag.Temperature.Enable()
			if err != nil {
				panic(err)
			}
		
		err = sensorTag.Humidity.Enable()
			if err != nil {
				panic(err)
			}	
			err = sensorTag.Mpu.Enable()
			if err != nil {
				panic(err)
			}	*/
		//............IsEnabled................................
		
		boolean,err := sensorTag.Temperature.IsEnabled() 
			if err != nil {
				panic(err)
			}
			log.Debug("IsEnabled: ",boolean)
		
		//......read temp data........................
		
		/*temp, err := sensorTag.Temperature.Read()
	 	if err != nil {
	 		panic(err)
	 	}
	 	log.Debug("Temperature C°", temp)
		
		humid, err := sensorTag.Humidity.Read()
	 	if err != nil {
	 		panic(err)
	 	}
	 	log.Debug("Humidity: ", humid)
		
		
		mpu1, err1 := sensorTag.Mpu.Read()
	 	if err1 != nil {
	 		panic(err1)
	 	}
	 	log.Debug("mpu: ", mpu1)
		
		barometric1, err2 := sensorTag.Barometric.Read()
	 	if err2 != nil {
	 		panic(err2)
	 	}
		log.Debug("barometric pressure: ", barometric1)*/
		//........StartNotify......................
		
		err = sensorTag.Temperature.StartNotify(tagAddress)
		if err != nil {
	 		panic(err)
	 	}
	
		err = sensorTag.Humidity.StartNotify(tagAddress)
		if err != nil {
	 		panic(err)
	 	}
		
		err = sensorTag.Mpu.StartNotify(tagAddress)
		if err != nil {
	 		panic(err)
	 	}
		
		err = sensorTag.Barometric.StartNotify(tagAddress)
		if err != nil {
	 		panic(err)
	 	}
		
		err = sensorTag.Luxometer.StartNotify(tagAddress)
		if err != nil {
	 		panic(err)
	 	}
		//...........IsNotifying................
		
		boolean,err = sensorTag.Temperature.IsNotifying() 
			if err != nil {
				panic(err)
			}
			log.Debug("IsNotifying: ",boolean)
			
		dev.On("data", emitter.NewCallback(func(ev emitter.Event) {
		
			x := ev.GetData().(api.DataEvent)
			//log.Debug("value of ev: ",ev)
			
			switch x.SensorType {
			
				case "pressure":
				
					log.Debug("************************pressure***************************************" )
					log.Debug("SensorType: ",x.SensorType)
					log.Debug("BarometericPressureValue: ",x.BarometericPressureValue)
					//log.Debug("Device : ",x.Device )
					log.Debug("BarometericPressureUnit: ",x.BarometericPressureUnit)
					log.Debug("BarometericTempValue: ",x.BarometericTempValue)
					log.Debug("BarometericTempUnit: ",x.BarometericTempUnit)
					log.Debug("SensorId : ",x.SensorId )
					
					barometericPressureValue:= fmt.Sprint(x.BarometericPressureValue)
					barometericPressureData := barometericPressureValue+"-"+x.SensorId+"-"+x.SensorType+"-"+x.BarometericPressureUnit
	
					if token := client.Publish("topic/sensor/data/pressure", 0, false, barometericPressureData ); token.Error() != nil {
		    
						fmt.Println(token.Error())
					}
					
				case "temperature":	
				
					log.Debug("***********************temperature****************************************" )
					log.Debug("SensorType: ",x.SensorType)
					log.Debug("AmbientTempValue: ",x.AmbientTempValue)
					//log.Debug("Device : ",x.Device )
					log.Debug("AmbientTempUnit : ",x.AmbientTempUnit )
					log.Debug("ObjectTempValue : ",x.ObjectTempValue )
					log.Debug("ObjectTempUnit : ",x.ObjectTempUnit )
					log.Debug("SensorId : ",x.SensorId )
					
					ambientTempValue := fmt.Sprint(x.AmbientTempValue)
					objectTempValue := fmt.Sprint(x.ObjectTempValue)
					
					ambientTemperatureData := ambientTempValue+"-"+x.SensorId+"-"+x.SensorType+"-"+x.AmbientTempUnit 
	
					if token := client.Publish("topic/sensor/data/ambientTemperature", 0, false, ambientTemperatureData); token.Error() != nil {
		    
						fmt.Println(token.Error())
					}
			
					objectTemperatureData := objectTempValue+"-"+x.SensorId+"-"+x.SensorType+"-"+x.ObjectTempUnit 
	
					if token := client.Publish("topic/sensor/data/objectTemperature", 0, false, objectTemperatureData); token.Error() != nil {
		    
						fmt.Println(token.Error())
					}
					
				case "humidity":	
				
					log.Debug("**************************humidity*************************************" )
					log.Debug("SensorType: ",x.SensorType)
					log.Debug("HumidityValue: ",x.HumidityValue)
					log.Debug("HumidityUnit: ",x.HumidityUnit)
					log.Debug("HumidityTempValue: ",x.HumidityTempValue)
					log.Debug("HumidityTempUnit: ",x.HumidityTempUnit)
					log.Debug("SensorId : ",x.SensorId )
					
					humidityValue:= fmt.Sprint(x.HumidityValue)
					humidityData := humidityValue+"-"+x.SensorId+"-"+x.SensorType+"-"+x.HumidityUnit
	
					if token := client.Publish("topic/sensor/data/humidity", 0, false,humidityData ); token.Error() != nil {
		    
						fmt.Println(token.Error())
					}
					
				case "mpu":	
				
					log.Debug("***************************mpu************************************" )
					log.Debug("SensorType: ",x.SensorType)
					log.Debug("mpuGyroscopeValue: ",x.MpuGyroscopeValue)
					log.Debug("mpuGyroscopeUnit: ",x.MpuGyroscopeUnit)
					log.Debug("mpuAccelerometerValue: ",x.MpuAccelerometerValue)
					log.Debug("mpuAccelerometerUnit: ",x.MpuAccelerometerUnit)
					log.Debug("mpuMagnetometerValue: ",x.MpuMagnetometerValue)
					log.Debug("mpuMagnetometerUnit: ",x.MpuMagnetometerUnit)
					log.Debug("SensorId : ",x.SensorId )
					
					mpuGyroscopeValue := fmt.Sprint(x.MpuGyroscopeValue)
					mpuGyroscopeData := mpuGyroscopeValue+"-"+x.SensorId+"-"+x.SensorType+"-"+x.MpuGyroscopeUnit
	
					if token := client.Publish("topic/sensor/data/gyroscope", 0, false,mpuGyroscopeData ); token.Error() != nil {
		    
						fmt.Println(token.Error())
					}
					
					mpuAccelerometerValue := fmt.Sprint(x.MpuAccelerometerValue)
					mpuAccelerometerData := mpuAccelerometerValue+"-"+x.SensorId+"-"+x.SensorType+"-"+x.MpuAccelerometerUnit
	
					if token := client.Publish("topic/sensor/data/accelerometer", 0, false,mpuAccelerometerData ); token.Error() != nil {
		    
						fmt.Println(token.Error())
					}
					
					mpuMagnetometerValue := fmt.Sprint(x.MpuMagnetometerValue)
					mpuMagnetometerData := mpuMagnetometerValue+"-"+x.SensorId+"-"+x.SensorType+"-"+x.MpuMagnetometerUnit
	
					if token := client.Publish("topic/sensor/data/magnetometer", 0, false,mpuMagnetometerData ); token.Error() != nil {
		    
						fmt.Println(token.Error())
					}
				case "luxometer":	
				
					log.Debug("**************************luxometer*************************************" )
					log.Debug("SensorType: ",x.SensorType)
					log.Debug("LuxometerValue : ",x.LuxometerValue )
					log.Debug("LuxometerUnit: ",x.LuxometerUnit)
					log.Debug("SensorId : ",x.SensorId )
					
					luxometerValue := fmt.Sprint(x.LuxometerValue )
					luxometerData :=luxometerValue +"-"+x.SensorId+"-"+x.SensorType+"-"+x.LuxometerUnit
	
					if token := client.Publish("topic/sensor/data/luxometer", 0, false,luxometerData ); token.Error() != nil {
		    
						fmt.Println(token.Error())
					}	
			}
			
			
		}))
		
		wg.Add (3)
		
}
//.......................start of mqtt initialization...................
func SubscribeMqtt ( ) {
 
	opts := MQTT.NewClientOptions()
	opts.AddBroker("tcp://localhost:1883")
	
	opts.SetClientID("securiot-ble")
	opts.SetCleanSession(false)
	  
	client = MQTT.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		    
			panic(token.Error())
			
		}
		fmt.Println("Sample Publisher Started")
	fmt.Printf("opts is of type %T\n", client)
	
}
var wg sync.WaitGroup