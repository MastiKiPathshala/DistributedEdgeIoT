/*************************************************************************
 *
 * $file: gpio_uart.go
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
    "encoding/json"
	"os/exec"
	"time"
 )
 
var sensorDataType string

func GpsSensorData(matchDataType string){

	sensorDataType = matchDataType
	TakeGpsData ()
}
func TakeGpsData () {
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
	
	lon := latlon["lon"]
	
	if lat != nil && lon != nil {

		latStr := fmt.Sprint(lat.(float64)+10.0)
		//fmt.Println("latitude ", latStr)
	
		log.Critical("latitude critical", latStr)
	
		lonStr := fmt.Sprint(lon.(float64)+12.0)
	
		//fmt.Println("longitude ", lonStr)
		log.Debug("longitude debug", lonStr)
	
		gpsData := latStr+"-"+lonStr+"-"+sensorDataType
	
		if token := client.Publish("topic/sensor/data/gps", 0, false, gpsData); token.Error() != nil {
		    
			fmt.Println(token.Error())
		}
	
		temperatureData := latStr+"-"+lonStr+"-"+"temperature"
	
		if token := client.Publish("topic/sensor/data/temperature", 0, false, temperatureData); token.Error() != nil {
		    
			fmt.Println(token.Error())
		}
	
		humidityData := latStr+"-"+lonStr+"-"+"humidity"
	
		if token := client.Publish("topic/sensor/data/humidity", 0, false, humidityData); token.Error() != nil {
		    
			fmt.Println(token.Error())
		}
		no2Data := latStr+"-"+lonStr+"-"+"no2"
	
		if token := client.Publish("topic/sensor/data/no2", 0, false, no2Data); token.Error() != nil {
		    
			fmt.Println(token.Error())
		}
		so2Data := latStr+"-"+lonStr+"-"+"so2"
	
		if token := client.Publish("topic/sensor/data/so2", 0, false, so2Data); token.Error() != nil {
		    
			fmt.Println(token.Error())
		}
	}else{

		fmt.Println("getting nil value for lat and lon")
	}
	
	time.AfterFunc(1000*time.Millisecond, TakeGpsData)
}

