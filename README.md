# baro
A simple barometric reporting application for CYTZ airport

## Backend -- getMETAR
The `getMETAR` folder contains a node application used to fetch the METAR at CYTZ from AWWS. Barometric readings are obtained from the altimeter setting in the METAR. NeDB is used to store the values to be consumed by the client.

## Client -- web interface
The `client` folder contains the web interface for reading and visualizing the data.  The client assumes there is access to the database via a link to the altimeter.db in getMETAR folder.

