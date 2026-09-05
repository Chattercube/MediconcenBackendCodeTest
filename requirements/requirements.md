> Legacy brief: [`new_requirements.pdf`](new_requirements.pdf) is the current assessment specification. This file is retained only to show the original project brief.

## Stack
Framework : NestJS
Language : NodeJS + Typescript
Database : MySQL 8
Cache Service : Redis

## Steps
1. Create an API endpoint that can accept 2 parameters “id1” and “id2” by POST method
2. Create a table in MySQL database to store the id1, id2 and a userID
3. When the system receives the request :
   1. Check from the database to see if id1 and id2 exist in the table (in the same row)
   2. If yes, get the userID and output to response in JSON format
   3. If not, generate a userID in UUIDv4 format, insert into table, and then output the userI D to response in JSON format
4.  Please draw a sequence diagram of your system

## Bonus Point
1. Create a DockerFile or docker-compose for deploying the service in docker container

Please submit the project through git repo.
