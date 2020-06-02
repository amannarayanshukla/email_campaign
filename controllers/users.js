const User = require('../models/user.model');

exports.user_create = function (req, res) {
    let user = new User(
        {
            email: req.body.email,
            password: req.body.password
        }
    );

    user.save(function (err) {
        if (err) {
            return res.send("error");
        }
        res.send('User Created successfully')
    })
};


exports.user_find = (req, res) => {
    let email = req.body.email;
    return User.find({email}).exec();
};

exports.user_find_id = (req, res) => {
    let id = req.body.id;
    return User.find({_id: id}).exec();
};

exports.user_update = (req, res, data) => {
    let id = req.params.id;
    User.find({_id: id})
        .then(users => {
            let campaignEmailIDs = users[0]._doc.campaignEmailIDs;
            let listIDs = users[0]._doc.listIDs;
            let campaigns = users[0]._doc.campaigns;

            campaignEmailIDs.push(data.emailID);
            listIDs.push(data.listID);
            campaigns.push(data.campaignName);

            return User.update({_id: id}, {campaignEmailIDs, listIDs, campaigns})
        })
        .then(data =>{
           return;
        })
        .catch(err => {
            return;
        })
};
