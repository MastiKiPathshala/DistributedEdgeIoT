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

func GpsSensorData(){

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
	log.Critical("latitude critical", lat)
    //fmt.Println("latitude ", lat)
	
	lon := latlon["lon"]
	log.Debug("longitude debug", lon)
    //fmt.Println("longitude ", lon)
	
	if token := client.Publish("gps-data", 0, false, out2); token.Error() != nil {
		    
		fmt.Println(token.Error())
	}
	time.AfterFunc(1000*time.Millisecond, GpsSensorData)
}
