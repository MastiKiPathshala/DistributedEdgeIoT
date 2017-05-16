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
 
 func main () {
 
 
    ReadConfigFiles ()
 	
 }
 
 func SubscribeMqtt ( ) {
 
   //...........................start of mqtt initialization..................................
  
    topic := flag.String("topic", "parkingstatus-resp", "The topic name to/from which to publish/subscribe")
    broker := flag.String("broker", "tcp://128.199.173.29:1883", "The broker URI. ex: tcp://10.10.1.1:1883")

	id := flag.String("id", "testgoid", "The ClientID (optional)")
	
	cleansess := flag.Bool("clean", false, "Set Clean Session (default false)")
	
	qos := flag.Int("qos", 0, "The Quality of Service 0,1,2 (default 0)")
	num := flag.Int("num", 1000, "The number of messages to publish or subscribe (default 1)")
	
	payload := flag.String("message", "hello", "The message text to publish (default empty)")
	
	action := flag.String("action", "sub", "Action publish or subscribe (required)")
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
      fmt.Printf("opts is of type %T\n", opts)
	if *action == "pub" {
	
		client := MQTT.NewClient(opts)
		
		if token := client.Connect(); token.Wait() && token.Error() != nil {
		
			panic(token.Error())
		}
		fmt.Println("Sample Publisher Started")
		
		for i := 0; i < *num; i++ {
		
			fmt.Println("---- doing publish ----")
			token := client.Publish(*topic, byte(*qos), false, *payload)
			token.Wait()
			
		}

		client.Disconnect(250)
		fmt.Println("Sample Publisher Disconnected")
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
   //......................end of mqtt initialization ..............................
 
 }

 var ReadMessage MQTT.MessageHandler= func (client MQTT.Client, msg MQTT.Message){
 
    //choke := make(chan [2]string)
	fmt.Println ( msg.Topic(),string(msg.Payload()) )
	//choke <- [2]string{msg.Topic(), string(msg.Payload())}
    
    //time.AfterFunc(1000*time.Millisecond, ReadMessage)
 }
 
 
 func ReadConfigFiles (){
     
	dat, err := ioutil.ReadFile("../../config.txt")
    if err != nil {
        fmt.Println("error occured")
        fmt.Printf("%s", err)
   }
    //fmt.Print(string(dat))
	//fmt.Printf("out2 is of type %T\n", dat)

	var config map[string]interface{}
	
	err2 := json.Unmarshal(dat, &config)
	
	if err2 != nil {
		fmt.Println("error:", err2)
	}
	
	//fmt.Println(config)
	
	wholeInfo := config["gatewaySaurabhpi"]
	
    //fmt.Println("wholeInfo: ", wholeInfo)
	
	// going inside the second level of json....
	
	 secLevelMachineInfo := wholeInfo.(map[string]interface{})
	
	//gatewayId := secLevelMachineInfo["gateway-id"]
	
	//fmt.Println("gatewayId ", gatewayId)
	
	
	// .([]interface{}) aftr adding this sensorConfig is treated like an array......
	
	sensorConfig := secLevelMachineInfo["sensor-config"].([]interface{})
	len := len(sensorConfig )
	
	for i := 0; i< len; i++ {
	
	    //fmt.Println("sensorConfig ", sensorConfig[i])
		
		sensorConfigDetail := sensorConfig[i].(map[string]interface{})
		
		connectionProtocol := sensorConfigDetail["connection-protocol"].(string)
		
		dataType := sensorConfigDetail["data-type"].(string)
		
		//fmt.Println(connectionProtocol+" "+dataType)
		
		//read config file for type of hardware....(for now lets say we get raspberry pi from hw config file)...
		
		hwName := "raspberry"
		
		ConfigureHardWare (connectionProtocol, hwName)
		validateProtocolDataType (connectionProtocol, dataType)
	
	}
	SubscribeMqtt ()
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
  
     //protocolDtataType := s.Join([]string{protocol,dataType}, "-")
	 
	 matchConnectionProtocol := protocol
	 matchDataType := dataType
	 
	 //fmt.Println(protocolDtataType)
	 
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
	        //wg.Wait()
		 
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
	//fmt.Println(latlon)
	
	lat := latlon["lat"]
    fmt.Println("latitude ", lat)
	
	lon := latlon["lon"]
    fmt.Println("longitude ", lon)
	
	/*strs := latlon["tag"].(string)
    fmt.Println(strs)*/
 }
 
 func RaspberryUartHw (){
 
    fmt.Println("RaspberryUartHw")
	
 }
 func RaspberryI2cHw (){
    
	fmt.Println("RaspberryI2cHw")
 
 }
 var wg sync.WaitGroup
