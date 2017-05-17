/*************************************************************************
 *
 * $file: gpio_main.go
 *
 * @brief: GPIO module code
 *
 * @author: Saurabh Singh
 *
 * @date: 15 May 2017 First version of GPIO code with only UART support
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 *
 ************************************************************************/


package main
 
import (
 
	"fmt"
    "io/ioutil"
    "encoding/json"
	//s "strings"
	"os/exec"
	"time"
	"sync"
	"flag"
	"os"
	MQTT "github.com/eclipse/paho.mqtt.golang"
)
 
var client MQTT.Client
var topic *string
 
func main () { 

	SubscribeMqtt ()
    ReadConfigFiles ()

 }
 
func SubscribeMqtt ( ) {
 
   //...........................start of mqtt initialization..................................
  
    topic = flag.String("topic", "gps-data", "The topic name to/from which to publish/subscribe")
	broker := flag.String("broker", "tcp://localhost:1883", "The broker URI. ex: tcp://10.10.1.1:1883")
	
	id := flag.String("id", "testgoid", "The ClientID (optional)")
	cleansess := flag.Bool("clean", false, "Set Clean Session (default false)")
	
	qos := flag.Int("qos", 0, "The Quality of Service 0,1,2 (default 0)")
	
	action := flag.String("action", "pub", "Action publish or subscribe (required)")
	store := flag.String("store", ":memory:", "The Store Directory (default use memory store)")
	
	flag.Parse()

	if *action != "pub" && *action != "sub" {
		fmt.Println("Invalid setting for -action, must be pub or sub")
		return
	}

	if *topic == "" {
		fmt.Println("Invalid setting for -topic, must not be empty")
		return
	}

	opts := MQTT.NewClientOptions()
	opts.AddBroker(*broker)
	
	opts.SetClientID(*id)
	opts.SetCleanSession(*cleansess)
	
	if *store != ":memory:" {
	
		opts.SetStore(MQTT.NewFileStore(*store))
	}
	  
	if *action == "pub" {
	
		client = MQTT.NewClient(opts)
		
		if token := client.Connect(); token.Wait() && token.Error() != nil {
		    
			panic(token.Error())
			
		}
		fmt.Println("Sample Publisher Started")
		
	} else {
		
		opts.SetDefaultPublishHandler(ReadMessage)
		
		client := MQTT.NewClient(opts)
		
		if token := client.Connect(); token.Wait() && token.Error() != nil {
		
			panic(token.Error())
		}

		if token := client.Subscribe(*topic, byte(*qos), nil); token.Wait() && token.Error() != nil {
		
			fmt.Println(token.Error())
			os.Exit(1)
			
		}
	}
 
 }

var ReadMessage MQTT.MessageHandler = func (client MQTT.Client, msg MQTT.Message){
 
	fmt.Println ( msg.Topic(),string(msg.Payload()) )
}
  
func ReadConfigFiles (){
     
	dat, err := ioutil.ReadFile("/etc/securiot.in/config.txt")
	
    if err != nil {
	
        fmt.Println("error occured")
        fmt.Printf("%s", err)
		
    }

	var config map[string]interface{}
	
	err2 := json.Unmarshal(dat, &config)
	
	if err2 != nil { 
	
		fmt.Println("error:", err2)

	}
		
	wholeInfo := config["gatewaySaurabhpi"]
	
    //fmt.Println("wholeInfo: ", wholeInfo)
	
	// going inside the second level of json....
	
	 secLevelMachineInfo := wholeInfo.(map[string]interface{})
	
	// .([]interface{}) aftr adding this sensorConfig is treated like an array......
	
	sensorConfig := secLevelMachineInfo["sensor-config"].([]interface{})
	len := len( sensorConfig )
	
	for i := 0; i< len; i++ {
	
	    //fmt.Println("sensorConfig ", sensorConfig[i])
		
		sensorConfigDetail := sensorConfig[i].(map[string]interface{})
		
		connectionProtocol := sensorConfigDetail["connection-protocol"].(string)
		
		dataType := sensorConfigDetail["data-type"].(string)
		
		//read config file for type of hardware....(for now lets say we get raspberry pi from hw config file)...
		
		hwName := "raspberry"
		
		ConfigureHardWare (connectionProtocol, hwName)
		validateProtocolDataType (connectionProtocol, dataType)
	
	}
	
    wg.Wait()
	
}
 
func ConfigureHardWare (connectionProtocol, hwName string){
     
	 
	switch hwName {
	    
		case "raspberry":
		
		    switch connectionProtocol {
			
			    case "uart":
				
			        RaspberryUartHw()
					
			    case "ble":
				    
					RaspberryI2cHw()
				
			}
		
		case "arduino":
		
		    fmt.Println("Arduino")
	 
	 }
  
}
 
 
func validateProtocolDataType (protocol, dataType string){
	 
	matchConnectionProtocol := protocol
	matchDataType := dataType
	 
	switch matchConnectionProtocol {
	    
		case "uart-gps":
		    
			out1, err1 := exec.Command( "bash", "-c", "sudo gpsd /dev/ttyS0 -F /var/run/gpsd.sock").Output()
            _,_ = out1,err1
			
		case "ble-HY":
		    
	}
	switch matchDataType {
	    
		case "gps":
		    
			out1, err1 := exec.Command( "bash", "-c", "sudo gpsd /dev/ttyS0 -F /var/run/gpsd.sock").Output()
            _,_ = out1,err1
			
		    GpsSensorData ()
			
		case "HY":
		    
		    BleSensor ()
			
			wg.Add (3)
	        
	}
	 
	 
}
  
var count int = 0
 
func BleSensor(){
 
    count ++
	
    if count > 5 {
	
	    wg.Done () 
	
	} else {
	
	    time.AfterFunc(1000*time.Millisecond, BleSensor)
        fmt.Println("ble-HY")
	
	}
	
 
}
/* 
func GpsSensorData(){
 
    time.AfterFunc(1000*time.Millisecond, GpsSensorData)
    out2, err := exec.Command( "bash", "-c", "gpspipe -w -n 8 | grep -m 1 TPV").Output()
   
    if err != nil {
	
        fmt.Println("error occured")
        fmt.Printf("%s", err)
		
    }
	
	var latlon map[string]interface{}
	
	err2 := json.Unmarshal(out2, &latlon)
	
	if err2 != nil {
	
		fmt.Println("error:", err2)
		
	}
	
	lat := latlon["lat"]
    fmt.Println("latitude ", lat)
	
	lon := latlon["lon"]
    fmt.Println("longitude ", lon)
	
	if token := client.Publish("gps-data", 0, false, out2); token.Error() != nil {
		    
		fmt.Println(token.Error())
	}
}
*/ 
func RaspberryUartHw (){
 
	fmt.Println("RaspberryUartHw")
	
}
func RaspberryI2cHw (){
    
	fmt.Println("RaspberryI2cHw")
 
}
var wg sync.WaitGroup
