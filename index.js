//<!-- GU CPSC 332 Example NodeJS server with Mongoose connecting to MongoDB -->

//used for our express module / routing
//https://expressjs.com/en/guide/routing.html
const express = require("express");
const app = express();

//method in express to recognize the incoming Request Object as strings or arrays.
//used for our POST method
app.use(express.urlencoded({
    extended: true
}));

//we want to use embedded javascript "template" files
app.set("view engine", "ejs");

//app.use(express.static("public"));

const PORT = process.env.PORT || 8080; //port we will connect to. process.evn.PORT used for Heroku later

//start listening for requests on the specified port
app.listen(PORT, function () {
    console.log("Server listening on port " + PORT);
});

//START of Mongoose configuration code
//MongoDB / Mongoose section of code
//used for our MongoDB database connection
//https://mongoosejs.com/docs/guide.html
const mongoose = require("mongoose");

//configure our schema to use with our database
const formSchema = new mongoose.Schema({
    first: String,
    last: String,
    rating: { type: Number, min: 0, max: 4 },
    agree: String,
    check1: Boolean
});

//create the model for our form data using our schema
//argument 1: uses/creates a MongoDB collection "formresults" -- makes string plural and lowercase
//so... "FormResult" is transformed to "formresults" on the MongoDB side.
//argument2: this is the schema you created above to be used with the MongoDB collection
//best practice to CapitalCase your model and model strings
const FormResult = mongoose.model("FormResult", formSchema);

//used for our database connections
const url = "mongodb://127.0.0.1:27017/"; //part of the database connection string
const DB_NAME = "testDB"; //database name

//connecting to our database.
//NOTE: for some reason localhost would not work for me but the localhost IP address worked.
mongoose.connect(url + DB_NAME, { useNewUrlParser: true });
//END of Mongoose configuration code

//START User Authentication

//used for encryption (salting and hashing our passwords)
const bcrypt = require("bcrypt");

//schema for our user
var UserSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
    }
});

//bcrypt methods
//hashing a password before saving it to the database
UserSchema.pre('save', function (next) {
    var user = this;
    //https://stackoverflow.com/questions/6832445/how-can-bcrypt-have-built-in-salts
    bcrypt.hash(user.password, 10, function (err, hash) {
        if (err) {
            return next(err);
        }
        user.password = hash;
        next();
    })
});

//Method to authenticate input against database
UserSchema.statics.authenticate = function (userData, req, res) {
    UserCredentials.findOne({
        username: userData.username
    })
        .exec(function (err, user) {
            if (err) {
                return res.render("error.ejs", {
                    errors: 2
                });
            } else if (!user) {
                var err = new Error('User not found.');
                err.status = 401;
                //error
                return res.render("error.ejs", {
                    errors: 2
                });
            }
            //if we get here, we did not hit an error...
            bcrypt.compare(userData.password, user.password, function (err, result) {
                if (result === true) { //password hashes match
                    //set up session cookie
                    req.session.userId = user._id;
                    return res.render("form.ejs");
                } else {
                    return res.redirect("/login");
                }
            })
        });
}

//model for our user
const UserCredentials = mongoose.model("UserCredential", UserSchema);

//session configuration
const session = require('express-session');
//use sessions for tracking logins
app.use(session({
    secret: "This is a secret string that should be stored in an environment variable!",
    resave: true,
    saveUninitialized: false
}));


//END user Authentication

const VALID_AGREE_VALUES = ["Yes", "Maybe", "No"];

//add path to root
//root path -- could probably change index.html to the /login HTML content, but we want error output
app.get("/", function (req, res) {
    return res.redirect("/login");
});

//respond to get requests at the root URL, e.g., /localhost:8080/form
app.get("/form", (req, res) => {

    if (req.session.userId) {
        //authenticate        
        validateSession(req.session.userId, res);
        res.render("form.ejs");
    } else {
        return res.redirect("/login");
    }
});

//CRUD
//CREATE
//respond to POST requests at specified URL, e.g., /localhost:8080/show/
app.post("/show", (req, res) => {

    if (req.session.userId) {
        //authenticate        
        validateSession(req.session.userId, res);
        //if invalid we will be redirected, otherwise we'll hit this block

        console.log("Form Data:");
        console.log(req.body);

        //Assumption: we are sanitizing and validating data before attempting to insert
        //you are responsible for this! In the below, we would want to reject the data
        //rather than submit it with a default value!
        //We create an object model... object and use the data we receive from our form
        let result = FormResult(
            {
                first: req.body.first,
                last: req.body.last,
                rating: req.body.rating < 0 || req.body.rating > 4 ? -1 : req.body.rating,
                agree: VALID_AGREE_VALUES.includes(req.body.agree) ? req.body.agree : "INVALID RESPONSE",
                check1: req.body.check1 == undefined ? false : true
            });

        //Saving the model data to our database as configured above
        result.save(
            (err, result) => {
                if (err) {
                    //note that we are not handling this error! You'll want to do this yourself!
                    return console.log("Error: " + err);
                }
                console.log(`Success! Inserted data with _id: ${result._id} into the database.`);
                console.log(result._doc);
                res.redirect("/show");
            });

    } else { //no session data, log in first
        return res.redirect("/login");
    }

});

//READ
//respond to GET requests at specified URL, e.g., /localhost:8080/show/
app.get("/show", (req, res) => {

    if (req.session.userId) {
        //authenticate        
        validateSession(req.session.userId, res);
        //if invalid we will be redirected, otherwise we'll hit this block

        //Using the static model method to query the database
        FormResult.find(
            {},
            (err, results) => {
                console.log(results)
                res.render("show.ejs", {
                    formResults: results
                });
            });

    } else { //no session data, log in first
        return res.redirect("/login");
    }
});

//UPDATE
app.route("/edit/:id")
    .get((req, res) => { //respond to GET requests at specified URL, e.g., /localhost:8080/edit/someIdValue

        if (req.session.userId) {
            //authenticate        
            validateSession(req.session.userId, res);
            //if invalid we will be redirected, otherwise we'll hit this block

            //grab the :id parameter value from our URL,
            //this is associated with our database primary key for this example
            let id = req.params.id;

            //Find the document in our MongoDB with the id value from our parameter
            //using the model static method
            FormResult.findById(
                id,
                (err, results) => {
                    console.log("Found result: ");
                    console.log(results)

                    //Build our object to pass on to our ejs to be rendered as HTML
                    let result = {
                        _id: id,
                        first: results.first,
                        last: results.last,
                        rating: results.rating,
                        agree: results.agree,
                        check1: results.check1
                    };

                    res.render("edit.ejs", {
                        response: result
                    });
                });
        } else { //no session data, log in first
            return res.redirect("/login");
        }

    })
    .post(function (req, res) { //respond to POST requests at specified URL, e.g., /localhost:8080/edit/someIdValue

        if (req.session.userId) {
            //authenticate        
            validateSession(req.session.userId, res);
            //if invalid we will be redirected, otherwise we'll hit this block

            //grab the :id parameter value from our URL,
            //this is associated with our database primary key for this example
            let id = req.params.id;

            //no validation of data done here! You absolutely should sanitize and validate
            let first = req.body.first;
            let last = req.body.last;
            let check1 = req.body.check1;
            let rating = req.body.rating;
            let agree = req.body.agree;

            //using the updateOne method and where query
            FormResult
                .where({ _id: id })
                .updateOne({
                    $set: {
                        first: first,
                        last: last,
                        check1: check1,
                        rating: rating,
                        agree: agree
                    }
                })
                .exec(function (err, result) {
                    if (err) return res.send(err);
                    res.redirect("/show");
                    console.log(`Successfully updated ${result.modifiedCount} record`);
                });

        } else { //no session data, log in first
            return res.redirect("/login");
        }

    });

//DELETE
//respond to GET requests at specified URL, e.g., /localhost: 8080 / delete /someIdValue/
//clearly this is not safe! It just deletes the matching record with no validation
app.route("/delete/:id")
    .get((req, res) => {

        if (req.session.userId) {
            //authenticate        
            validateSession(req.session.userId, res);
            //if invalid we will be redirected, otherwise we'll hit this block

            //grab the :id parameter value from our URL,
            //this is associated with our database primary key for this example
            let id = req.params.id;

            //not necessary but we can grab the value we're about to delete...
            FormResult.findById(
                id,
                (err, results) => {
                    console.log(results)

                    let result = {
                        _id: id,
                        first: results.first,
                        last: results.last,
                        rating: results.rating,
                        agree: results.agree,
                        check1: results.check1
                    };
                    console.log("We are about to delete: " + JSON.stringify(result));
                });


            //perform the actual deletion
            FormResult.deleteOne(
                { _id: id },
                (err, result) => {
                    console.log(result);

                    console.log(`${result.deletedCount} record deleted`);
                    res.redirect("/show");
                });

        } else { //no session data, log in first
            return res.redirect("/login");
        }
    });

//for user authentication
//POST route for creating a user
app.route("/register")
    .get((req, res) => {
        let errors = {
            usernameError: ""
        }
        res.render("register.ejs", errors);
    })
    .post((req, res) => {
        if (req.body.username &&
            req.body.password &&
            req.body.passwordConf) {
            var userData = UserCredentials({
                username: req.body.username,
                password: req.body.password,
            });

            //use schema.create to insert data into the db
            userData.save(function (err, user) {
                if (err) {
                    let errors = {
                        usernameError: "Invalid username"
                    }
                    res.render("register.ejs", errors);
                } else {
                    return res.redirect("/show");
                }
            });
        }
    });

app.route("/login")
    .get((req, res) => {
        let errors = {
            usernameError: ""
        }
        res.render("login.ejs", errors);
    })
    .post((req, res) => {
        if (req.body.username &&
            req.body.password) {
            var userData = {
                username: req.body.username,
                password: req.body.password,
            }
            let temp = UserCredentials.authenticate(userData, req, res);
            let temp2 = 0;
        }
    });

function validateSession(_id, res) {
    if (_id != "" && _id != undefined) {
        //authenticate
        UserCredentials.findOne({
            _id: _id
        }).exec(function (err, user) {
            if (err) {
                return res.render("error.ejs", {
                    errors: 2
                });
            } else if (!user) {
                var err = new Error('User not found.');
                err.status = 401;
                //error
                return res.render("error.ejs", {
                    errors: 2
                });
            }
            //if authenticated give access 
            return;
        });

    } else {
        //redirect to log in
        return res.redirect("/login");
    }
};

// GET /logout
app.get('/logout', function (req, res, next) {
    if (req.session) {
        // delete session object
        req.session.destroy(function (err) {
            if (err) {
                return next(err);
            } else {
                return res.redirect('/');
            }
        });
    }
});

