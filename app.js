'use strict';

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const csv = require("csvtojson/v2");
var cors = require('cors');
const axios = require('axios').default;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const uuidv4 = require('uuid').v4();
const mongoose = require('mongoose');
const uniqid = require('uniqid');
var AsyncPolling = require('async-polling');


const user = require('./routes/user.route');
const userController = require('./controllers/users');


let dev_db_url = 'mongodb://someuser:abcd1234@ds155845.mlab.com:55845/email_campaign';
let mongoDB = process.env.MONGODB_URI || dev_db_url;
mongoose.connect(mongoDB);
// mongoose.Promise = global.Promise;
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));



// //TODO: Make a schema in MongoDB
// let users = [{
//     email : "aman",
//     password : "$2b$10$wfNcP/QawmqSKIDugkV1iOSpcUhHQpimmO/MKwooqrEvoZunHZH/S"
// }, {
//     email : "aryan",
//     password : "$2b$10$wfNcP/QawmqSKIDugkV1iOSpcUhHQpimmO/MKwooqrEvoZunHZH/S"
// }];

const app = express();
const client = redis.createClient({host : process.env.REDIS_HOSTNAME, port: process.env.REDIS_PORT}); //creates a new client
const saltRounds = 10;

client.on('connect', function() {
    console.log('redis connected');
});

app.use(cors());

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));


// parse application/json
app.use(bodyParser.json());
app.use(express.static('public'));

const createAccessToken = (email) => {
    return jwt.sign({ email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1 h'});
};

const authenticateToken = (req, res, next) => {
    //TODO: check if uuid is present in redis or not is not than fail

    console.log(req.body, "REQ BODY");
    console.log(req.headers, "REQ headers");

    let token = req.body.accessToken;
    if(!token){
        return res.status(401).json({message : "token not found"})
    }

    // verify a token symmetric
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, user) {
        console.log(err,"ERROR")
        if(err) {
            return res.status(401).json({message : "error authenticating token"});
        }
        console.log(user.email, "USER EMAIL");
        req.body.email = user.email;
        next()
    });

};


let campaign = [];
let list = [];
let uniqID = uniqid();

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, './public');
    },
    filename: function (req, file, cb) {
        cb(null , `${uniqID}${file.originalname}`);
    }
});
const upload = multer({storage}).single("file");

let csvFilePath;

let listID;
let jobID;



app.get(`/`, (req, res) => {
    console.log("someone hit this");
    res.json({campaign, list})
});

app.post('/verify',authenticateToken,(req,res) => {
    return res.json({'email':req.body.email})
});

// app.post('/token', (req, res) => {
//     const refreshToken = req.body.token;
//     const uuid = req.body.uuid;
//
//     if(!refreshToken || !uuid){
//         return res.json({message : "no refresh token found or uuid found"})
//     }
//
//     client.get(uuid, function(err, reply) {
//         if(err){
//             return res.json({message: "uuid not found"})
//         }
//         if(!reply){
//             return res.json({message : "no key found for the uuid"})
//         }
//
//         // verify a token symmetric
//         if(refreshToken === reply ){
//             jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, function(err, user) {
//                 const accessToken = createAccessToken(user.email);
//                 return res.json({accessToken});
//             })} else {
//             return res.json({message :"wrong refresh token mapped"});
//         }
//     });
// });

app.post('/user/create',userController.user_create);

app.post('/user/login', (req, res) => {

    // const user = users.filter(item => {
    //     return item.email === req.body.email;
    // });
    // if(!user || user.length === 0){
    //     return res.status(401).json({message : "wrong email or password"})
    // }
    userController.user_find(req,res)
        .then(users => {
            console.log(users);
            bcrypt.compare(req.body.password, users[0].password, function(err, result) {
                if(err){
                    return res.json({message : "unable to login please try again"});
                }
                if(!result){
                    return res.status(401).json({message : "wrong email or password"});
                }

                const accessToken = createAccessToken({email : req.body.email});
                const refreshToken = jwt.sign({email: req.body.email}, process.env.REFRESH_TOKEN_SECRET);
                const uuid = uuidv4;

                client.set(uuid, refreshToken, function(err, reply) {
                    if(err){
                        return res.json({message : "please try login in again"})
                    }
                    return res.json({message : "successful logged in", email : req.body.email,id:users[0]._id, accessToken, refreshToken, uuid});
                });
            });
        })
        .catch(err => {
            console.log(err,"err");
            return res.status(401).json({message:`Wrong email or password`})
        })


});

app.post('/user/logout',authenticateToken,(req, res) => {
    const uuid = req.body.uuid;

    console.log(uuid, "UUID");

    client.del(uuid, function(err, reply) {
        if(err){
            return res.json({message: "unable to delete refresh token"})
        }
        return res.json({message : "refresh token deleted"})
    });
});



app.post("/create-campaign/:id",authenticateToken ,(req,res) => {

    // console.log(req.body, "REQUEST BODY");

    const body = req.body.data;

    let email = body.email;
    let tags = body.tags;
    let campaignName = body.campaignName;



    let listID;
    // let csvFilePath = `./public/${body.contactList}`;
    axios({
        method:`post`,
        url: `https://api.sendgrid.com/v3/marketing/lists`,
        headers: {
            'Authorization': 'Bearer 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'
        },
        data: JSON.stringify({
                    "name":`${uniqID}${body.campaignName}`
        })
    })
        .then(function (response) {
            let data = response.data;
            listID = data.id;
            return listID
        })
        .then(listID => {
            return csv()
                .fromFile(csvFilePath)
        })
        .then(jsonObj => {
            // console.log(jsonObj,"JSONOBJ");
             return jsonObj.map(item => {
                const response = Object.values(item)[0].split(',');
                return {
                    first_name : item.first_name,
                    last_name : item.last_name,
                    email: item.email,
                }
            });
        })
        .then(data => {
            return axios({
                method:`put`,
                url: `https://api.sendgrid.com/v3/marketing/contacts`,
                headers: {
                    'Authorization': 'Bearer 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',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    "list_ids": [listID],
                    "contacts": data
                })
            })
        })
        .then(response => {
            return jobID = response.data.job_id;
        })
        .then(jobID => {
        //     //TODO check the status of the job_id
        // }).then(()=>

            //------

            const polling = AsyncPolling(function (end) {
                console.log(jobID, "JOBID IN POLLING")
                axios({
                    method:'get',
                    url:`https://api.sendgrid.com/v3/marketing/contacts/imports/${jobID}`,
                    headers: {
                        'Authorization': 'Bearer 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',
                        'Content-Type': 'application/json'
                    }
                })
                    .then(response => {
                        end(null,response);
                    })
                    .catch(err => {
                        end(err);
                    })
                // someAsynchroneProcess(function (error, response) {
                //     if (error) {
                //         // Notify the error:
                //         end(error)
                //         return;
                //     }
                //
                //     // Do something with the result.
                //
                //     // Then send it to the listeners:
                //     end(null, result);
                // });
            }, 10000);

            polling.run();

            polling.on('error', function (error) {
                console.log(error, "ERROR");
            });
            polling.on('result', function (result) {
                // The polling yielded some result, process it here.
                if(result.data.status === 'completed'){
                        polling.stop();
                        return Promise.all(email.map(item => {
                            return axios({
                                method:'post',
                                url:'https://api.sendgrid.com/v3/marketing/singlesends',
                                headers: {
                                    'Authorization': 'Bearer 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',
                                    'Content-Type': 'application/json'
                                },
                                data:  JSON.stringify({
                                    "name": campaignName,
                                    "send_at": new Date(item.time).toISOString(),
                                    "send_to": {
                                        "list_ids": [listID]
                                    },
                                    "email_config": {
                                        "subject": item.subject,
                                        "html_content": `${item.html_content} <br/> <a href = "http://localhost:9999/user/unsubscribe/{{email}}/${listID}"> Unsubscribe </a><br/><br/>`,
                                        "plain_content": item.plain_content,
                                        "generate_plain_content": true,
                                        "sender_id": item.sender_id,
                                        // "suppression_group_id": 91273,
                                        "custom_unsubscribe_url": "http://localhost:9999/"
                                    }
                                })
                            })
                        }))
                        .then(responses => {
                            console.log(responses,"RESPONSES");
                            return Promise.all(responses.map(response => {
                                // TODO: uncomment
                                userController.user_update(req,res, {emailID : response.data.id ,campaignName, listID });
                                return axios({
                                    method:'put',
                                    url:`https://api.sendgrid.com/v3/marketing/campaigns/${response.data.id}/schedule`,
                                    'headers': {
                                        'Authorization': 'Bearer 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',
                                        'Content-Type': 'application/json'
                                    },
                                    data: JSON.stringify({
                                        "send_at": new Date(response.data.send_at).toISOString()
                                    })
                                })
                            }))
                        })
                        .then(response => {
                            return res.json({message: "done"})
                        })
                        .catch(err => {
                            console.log(err, "ERROR")
                        })

                }
            });





            //-----------
           tags.map(item => {
               if (item !== 'first_name' || item !== 'last_name' || item !== 'email'){
                   return axios({
                       method: 'post',
                       url:`https://api.sendgrid.com/v3/marketing/field_definitions`,
                       headers: {
                           'Authorization': 'Bearer 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',
                           'Content-Type': 'application/json'
                       },
                       data: JSON.stringify({
                           "name": item,
                           "field_type": "Text"
                       })
                   })
               }
           })
        })
        .then(response => {
            return res.json({message : "In progress"})
        //     return Promise.all(email.map(item => {
        //         return axios({
        //             method:'post',
        //             url:'https://api.sendgrid.com/v3/marketing/singlesends',
        //             headers: {
        //                 'Authorization': 'Bearer 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',
        //                 'Content-Type': 'application/json'
        //             },
        //             data:  JSON.stringify({
        //                 "name": campaignName,
        //                 "send_at": new Date(item.time).toISOString(),
        //                 "send_to": {
        //                     "list_ids": [listID]
        //                 },
        //                 "email_config": {
        //                     "subject": item.subject,
        //                     "html_content": `${item.html_content} \n <a href = "http://localhost:9999/user/unsubscribe/{{email}}/${listID}"> Unsubscribe </a>`,
        //                     "plain_content": item.plain_content,
        //                     "generate_plain_content": true,
        //                     "sender_id": item.sender_id,
        //                     "suppression_group_id": 91273,
        //                     // "custom_unsubscribe_url": "http://localhost:9999/"
        //                 }
        //             })
        //         })
        //     }))
        })
        // .then(responses => {
        //     console.log(responses,"RESPONSES");
        //     return Promise.all(responses.map(response => {
        //         // TODO: uncomment
        //         userController.user_update(req,res, {emailID : response.data.id ,campaignName, listID });
        //         return axios({
        //             method:'put',
        //             url:`https://api.sendgrid.com/v3/marketing/campaigns/${response.data.id}/schedule`,
        //             'headers': {
        //                 'Authorization': 'Bearer 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',
        //                 'Content-Type': 'application/json'
        //             },
        //             data: JSON.stringify({
        //                 "send_at": new Date(response.data.send_at).toISOString()
        //             })
        //         })
        //     }))
        // })
        // .then(response => {
        //     return res.json({message: "done"})
        // })
        .catch(err => {
            console.log(err, "ERROR")
        })
});


app.post("/data/:id",upload,(req, res) => {
    console.log(req.file.originalname);
    // const path = `${}${}`;
    csvFilePath = `./public/${uniqID}${req.file.originalname}`;
    console.log(csvFilePath,"CSV FILE PATH");
    console.log("BUFFER", req.file.buffer);
    return res.json({fileName: csvFilePath})
});

app.get("/user/unsubscribe/:email/:listid", (req, res) => {
    console.log(req.params, 'REQ');

    let email = req.params.email;
    let listID = req.params.listid;

    axios({
        method:`get`,
        url: `https://api.sendgrid.com/v3/marketing/contacts`,
        headers: {
            'Authorization': 'Bearer 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'
        }
    })
        .then(response => {
            let data = response.data.result;

            data = data.filter(item => {
                    return item.list_ids[0] === listID && item.email === email;
            });
            return data;
        })
        .then(result => {
            if(result.length > 0) {
                return result.map(item => {
                    axios({
                        method:`delete`,
                        url: `https://api.sendgrid.com/v3/marketing/contacts?ids=${item.id}`,
                        headers: {
                            'Authorization': 'Bearer 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'
                        }
                    })
                })
            }
        })
        .then(result => {
            return res.json({message : "unsubscribed"});
        })
        .catch(err => {
            console.log(err)
            return res.status(401).json({message : "please try again later"})
        });
})

app.listen(9999, () => {
    console.log('Started on port 9999');
});
