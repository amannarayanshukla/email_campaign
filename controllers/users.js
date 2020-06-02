const User = require('../models/user.model');

exports.user_create = function (req, res) {
    let user = new User(
        {
            email: req.body.email,
            password: req.body.password
        }
    );

    user.save(function (err) {
        console.log(err,"ERROR")
        if (err) {
            return res.send("sdfdsf");
        }
        res.send('User Created successfully')
    })
};


exports.user_find = (req, res) => {
    let email = req.body.email;

    return User.find({email}).exec();
        // .then(user => {
        //     console.log(user[0],"USER");
        //     return user[0];
        // })
        // .catch(err => {
        //     console.log(err)
        //     return res.status(401).json({message: `Wrong email or password`})
        // })
};

exports.user_find_id = (req, res) => {
    let id = req.body.id;

    return User.find({_id: id}).exec();
};

exports.user_update = (req, res, data) => {
    let id = req.params.id;
    console.log(data,"DATA")
    User.find({_id: id})
        .then(users => {
            console.log(users,"USERS");
            let campaignEmailIDs = users[0]._doc.campaignEmailIDs;
            let listIDs = users[0]._doc.listIDs;
            let campaigns = users[0]._doc.campaigns;

            campaignEmailIDs.push(data.emailID);
            listIDs.push(data.listID);
            campaigns.push(data.campaignName);

            return User.update({_id: id}, {campaignEmailIDs, listIDs, campaigns})
        })
        .then(data =>{
            console.log(data,"HEHEHEHHE")
            // return res.json({message : 'document updated'})
        })
        .catch(err => {
            console.log(err,"ERRRRR HEHEHEHHE")
        })
};
