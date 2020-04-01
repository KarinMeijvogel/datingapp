// "Server started" message --------------------------------------------------------------------
console.log("Server started, wait for database to connect...");

// Express --------------------------------------------------------------------------------------
const express = require("express");
const app = express();

// Define static files folder -------------------------------------------------------------------
app.use("/static", express.static("static"));

// EJS ------------------------------------------------------------------------------------------
app.set("view engine", "ejs");

// Use body-parser ------------------------------------------------------------------------------
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({extended: true}));

// MongoDB ---------------------------------------------------------------------------------------
require("dotenv").config();
const mongo = require("mongodb");

let db = null;
let url = "mongodb+srv://" + process.env.DB_USER + ":" + process.env.DB_PASS + "@" + process.env.DB_HOST + "/test?retryWrites=true&w=majority";

mongo.MongoClient.connect(url, function (err, client) {
  if (err) {
    throw err;
  }
  db = client.db(process.env.DB_NAME);
  console.log("Connected to database.");
  
  // the allUsersCollection contains general data about all user accounts
  allUsersCollection = db.collection("users");
})

// Session --------------------------------------------------------------------------------------
let session = require("express-session");

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true  
}))

// Handle routes ----------------------------------------------------------------------
app.get("/", allUsers);
app.get("/login", loginPage);
app.get("/browsepage", allUsers);
app.get("/addfilters", filterPage);
app.get("/likedpage", likedUsers);
app.get("/profile/:id", profile);
app.post("/login", login);
app.post("/addfilters", addFilters);
app.post("/:id", like);
app.delete("/:id", remove);
app.use(onNotFound);

function loginPage(req, res, next) {
  res.render("login.ejs");
}

function login(req, res, next) {
  allUsersCollection.findOne({id: req.body.user}, (err, data) => {
    if (err) {
      next (err);
    } else {
      req.session.user = data;
      res.redirect("/");
      console.log("Logged in as " + req.session.user.name);
    }
  })
}

function allUsers(req, res, next) {
  // redirect to login page if no one's logged in
  if (!req.session.user) {
    res.redirect("/login");
    return;
  }
  // find current user
  allUsersCollection.findOne({_id: mongo.ObjectId(req.session.user._id)}, (err, data) => {
    if (err) {
      next (err);
    } else {
      const currentUser = data;

      // display the people who match our user's filters
      allUsersCollection.find({
        $and: [
          {_id: {$ne: mongo.ObjectId(req.session.user._id)}},
          {id: {$nin: currentUser.hasLiked}},
          {id: {$nin: currentUser.hasDisliked}},
          {gender: {$in: currentUser.preference["gender"]}},
          {age: {$gte: currentUser.preference["minAge"]}}
        ]
      }).toArray(done)

      function done(err, filteredPeople) {
        if (err) {
          next (err);
        } else {
          res.render("index.ejs", {data: filteredPeople})
        }
      }
    }
  })
}


function filterPage(req, res, next) {
  res.render("addfilters.ejs");
}

function addFilters(req, res, next) {
  // put filter-formdata in the user's preferences-object in the db
  const userPrefs = {};
  userPrefs["minAge"] = parseInt(req.body.years);
  userPrefs["gender"] = req.body.gender;

  // make sure the "gender" prefs is an array
  if (!Array.isArray(userPrefs["gender"])) {
    userPrefs["gender"] = req.body.gender.split(" ")
  }

  allUsersCollection.updateOne({_id: mongo.ObjectId(req.session.user._id)}, { $set: {preference: userPrefs}});
  res.redirect("/browsepage")
}
  
function profile(req, res, next) {
  // load profile data
  let id = req.params.id;
  allUsersCollection.findOne({
    id: id
  }, done)
  
  function done(err, data) {
    if (err) {
      next(err);
    } else {
      res.render("profile.ejs", {data: data});
    }
  }
}

function likedUsers(req, res, next) {
  // redirect to login page if no one's logged in
  if (!req.session.user) {
    res.redirect("/login");
    return;
  }
  allUsersCollection.find().toArray(done);

  function done(err, data) {
    if (err) {
      next(err);
    } else {
      // find our current user in the db
      let currentUser = data.filter((object) => {
        return object._id == req.session.user._id;
      })[0];
      
      // divide our user's likes in matches and pending
      let matches = [];
      let pending = [];
      
      // check who's matched and who's pending
      for (let i = 0; i < data.length; i++) {
        // condition for matching: you have liked them, they have liked you, you haven't deleted them, they haven't deleted you
        if (currentUser.hasLiked.includes(data[i].id) && data[i].hasLiked.includes(currentUser.id) && !currentUser.hasDisliked.includes(data[i].id) && !data[i].hasDisliked.includes(currentUser.id)) {
          matches.push(data[i]);
        // condition for pending: you have liked them, they haven't liked or disliked/deleted you yet
        } else if (currentUser.hasLiked.includes(data[i].id) && !data[i].hasLiked.includes(currentUser.id) && !data[i].hasDisliked.includes(currentUser.id)) {
          pending.push(data[i]);
        }
      }

      let likedPageContent = {matches, pending};
      
      // render the matching and pending arrays into the html
      res.render("likedpage.ejs", {data: likedPageContent});
    }
  } 
}

function like(req, res, next) {
  // add liked person to our user's hasLiked array
  let id = req.params.id;
  allUsersCollection.updateOne({_id: mongo.ObjectId(req.session.user._id)}, {$push: {"hasLiked": id}});

  console.log(id + " liked by " + req.session.user.id)
  res.redirect("/");
}

function remove(req, res, next) {
  // add disliked person to the user's hasDisliked array
  let id = req.params.id;
  allUsersCollection.updateOne({_id: mongo.ObjectId(req.session.user._id)}, {$push: {"hasDisliked": id}});
  
  console.log(id + " disliked by " + req.session.user.id)
}

function onNotFound(req, res, next) {
  res.status(404).sendFile(__dirname + "/static/notfound.html")
}

// Listen on a port
app.listen(3000);