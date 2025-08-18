const express = require("express");
require("dotenv").config();
const cookieParser = require("cookie-parser");

const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
//-----------------------------------
const admin = require("firebase-admin");

const decodedkey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);

const serviceAccount = JSON.parse(decodedkey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//----------------------------
const app = express();
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://assignnment12.web.app",
    "https://flourishing-kelpie-5b7554.netlify.app",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
const jwt = require("jsonwebtoken");
app.use(express.json());
app.use(cookieParser());

const port = process.env.PORT || 3000;

//----------------------------------------

app.get("/", (req, res) => {
  res.send("✅ Server is running!");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hqw7wrn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const myDB = client.db("assignment_property");
const myProperty = myDB.collection("propertys");
const wishlist = myDB.collection("wishlists");
const reviewsCollection = myDB.collection("reviews");
const offersCollection = myDB.collection("offers");
const usersCollection = myDB.collection("users");
const paymentsCollection = myDB.collection("payment");

async function run() {
  try {
    //jwt
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // Add Property
    app.post("/add-property", async (req, res) => {
      const property = req.body;
      property.verificationStatus = "pending";
      const result = await myProperty.insertOne(property);
      res.send(result);
    });

    app.get("/property", async (req, res) => {
      const { verifiedOnly } = req.query;

      let query = {};
      if (verifiedOnly === "true") {
        query.verificationStatus = "verified";
        const result = await myProperty.find(query).toArray();
        return res.send(result);
      }

      const result = await myProperty.find().limit(4).toArray();
      res.send(result);
    });

    app.get("/propertys", async (req, res) => {
      const { verifiedOnly } = req.query;

      let query = {};

      const result = await myProperty.find().toArray();
      res.send(result);
    });

    // Get Single Property
    app.get("/property/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const property = await myProperty.findOne({ _id: new ObjectId(id) });
        if (!property) {
          return res.status(404).send({ message: "Property not found" });
        }
        res.send(property);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Error fetching property" });
      }
    });

    // Get Properties of specific agent
    app.get("/myProperty", async (req, res) => {
      const { agentEmail } = req.query;
      const query = agentEmail ? { agentEmail } : {};
      const properties = await myProperty.find(query).toArray();
      res.send(properties);
    });

    // Delete Property
    app.delete("/property/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await myProperty.deleteOne({ _id: new ObjectId(id) });
        if (!result.deletedCount) {
          return res.status(404).send({ message: "Property not found" });
        }
        res.send({ message: "Property deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to delete property" });
      }
    });

    // ✅ Update verification status
    app.patch("/property/:id/status", async (req, res) => {
      const id = req.params.id;
      const { verificationStatus } = req.body;

      if (!["verified", "rejected", "pending"].includes(verificationStatus)) {
        return res.status(400).send({ message: "Invalid status" });
      }

      try {
        const result = await myProperty.updateOne(
          { _id: new ObjectId(id) },
          { $set: { verificationStatus } }
        );

        if (!result.matchedCount) {
          return res.status(404).send({ message: "Property not found" });
        }

        res.send({ message: `Property marked as ${verificationStatus}` });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update status" });
      }
    });
    app.put("/myProperty/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      delete updatedData._id;

      try {
        const result = await myProperty.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (!result.matchedCount) {
          return res.status(404).send({ message: "Property not found" });
        }

        res.send({ message: "Property updated successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update property" });
      }
    });

    //create payment intent for order
    app.post("/create-payment-intent", async (req, res) => {
      const { offerAmount } = req.body;
      const amount = offerAmount * 100;

      //!stripe.................................
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    //payment
    // GET all sold properties
    app.get("/payments", async (req, res) => {
      try {
        const soldProperties = await paymentsCollection.find().toArray();
        res.send(soldProperties);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch sold properties" });
      }
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      payment.status = "bought";

      const result = await paymentsCollection.insertOne(payment);

      // Update the offer status to "bought" and set the transactionId
      const updateResult = await offersCollection.updateOne(
        { propertyId: payment.propertyId, buyerEmail: payment.buyerEmail },
        {
          $set: {
            status: "bought",
            transactionId: payment.transactionId,
          },
        }
      );

      res.send({
        success: true,
        insertedId: result.insertedId,
        transactionId: payment.transactionId,
        updateResult,
      });
    });

    // GET all sold properties of an agent
    app.get("/sold-properties", async (req, res) => {
      const agentEmail = req.query.email;

      const soldProperties = await paymentsCollection
        .find({ agentEmail: agentEmail, status: "bought" })
        .toArray();

      res.send(soldProperties);
    });

    // Wishlist
    app.post("/wishlist", async (req, res) => {
      const { userEmail, propertyId } = req.body;

      if (!userEmail || !propertyId) {
        return res
          .status(400)
          .send({ message: "userEmail & propertyId required" });
      }

      const existing = await wishlist.findOne({ userEmail, propertyId });
      if (existing) {
        return res.status(409).send({ message: "Already in wishlist" });
      }

      const property = await myProperty.findOne({
        _id: new ObjectId(propertyId),
      });
      if (!property) {
        return res.status(404).send({ message: "Property not found" });
      }

      const item = {
        userEmail,
        propertyId,
        propertyTitle: property.title,
        propertyImage: property.images?.[0] || property.image,
        propertyLocation: property.location,
        agentName: property.agentName,
        agentImage: property.agentImage,
        isVerified: property.verificationStatus === "verified",
        priceRange: property.priceRange,
        createdAt: new Date(),
      };

      const result = await wishlist.insertOne(item);
      res.status(201).send({ message: "Added to wishlist", result });
    });

    app.get("/wishlist", async (req, res) => {
      const { userEmail } = req.query;

      if (!userEmail) {
        return res
          .status(400)
          .send({ message: "userEmail query param required" });
      }

      const result = await wishlist.find({ userEmail }).toArray();
      res.send(result);
    });

    app.delete("/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      const result = await wishlist.deleteOne({ _id: new ObjectId(id) });

      if (!result.deletedCount) {
        return res.status(404).send({ message: "Item not found" });
      }

      res.send({ message: "Item removed from wishlist" });
    });

    //user
    app.post("/user", async (req, res) => {
      const userData = req.body;
      userData.role = "customer";
      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();

      const query = {
        email: userData?.email,
      };
      const alreadyExists = await usersCollection.findOne(query);
      if (!!alreadyExists) {
        const result = await usersCollection.updateOne(query, {
          $set: { last_loggedIn: new Date().toISOString() },
        });
        return res.send(result);
      }
      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });
    app.get("/users", verifyToken, async (req, res) => {
      const filter = {
        email: {
          $ne: req?.user?.email,
        },
      };
      const users = await usersCollection.find(filter).toArray();
      res.send(users);
    });

    app.patch("/user/:id/role", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      if (!["admin", "agent"].includes(role)) {
        return res.status(400).send({ message: "Invalid role" });
      }

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    app.patch("/user/:id/fraud", async (req, res) => {
      const { id } = req.params;

      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user || user.role !== "agent") {
        return res
          .status(400)
          .send({ message: "Only agents can be marked fraud" });
      }

      await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "fraud" } }
      );

      await myProperty.deleteMany({ agentEmail: user.email });

      res.send({ message: "Agent marked as fraud and properties removed" });
    });

    const admin = require("firebase-admin");

    app.delete("/user/:id", async (req, res) => {
      const { id } = req.params;
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user) return res.status(404).send({ message: "User not found" });

      await usersCollection.deleteOne({ _id: new ObjectId(id) });

      try {
        const fbUser = await admin.auth().getUserByEmail(user.email);
        await admin.auth().deleteUser(fbUser.uid);
      } catch (err) {
        console.error(err);
      }

      res.send({ message: "User deleted from DB & Firebase" });
    });

    //get a user's role
    app.get("/user/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      if (!result) return res.status(404).send({ message: "User not found" });
      res.send({ role: result?.role });
    });

    // Reviews
    app.post("/reviews", async (req, res) => {
      const {
        propertyId,
        userEmail,
        userName,
        comment,
        agentName,
        propertyTitle,
        userImage,
      } = req.body;

      if (
        !propertyId ||
        !userEmail ||
        !userName ||
        !comment ||
        !propertyTitle ||
        !userImage
      ) {
        return res.status(400).send({ message: "All fields are required" });
      }

      const review = {
        propertyId,
        userEmail,
        userName,
        comment,
        agentName,
        propertyTitle,
        userImage,
        createdAt: new Date(),
      };

      const result = await reviewsCollection.insertOne(review);
      res.status(201).send({ message: "Review added", result });
    });

    app.get("/reviews/latest", async (req, res) => {
      try {
        const result = await reviewsCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(3)
          .toArray();

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch latest reviews" });
      }
    });

    app.get("/reviews", async (req, res) => {
      const { userEmail } = req.query;

      if (userEmail) {
        const result = await reviewsCollection.find({ userEmail }).toArray();
        return res.send(result);
      }

      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (!result.deletedCount) {
        return res.status(404).send({ message: "Review not found" });
      }

      res.send({ message: "Review deleted successfully" });
    });

    // Get all reviews (admin)
    app.get("/reviews/all", async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch reviews" });
      }
    });

    app.delete("/adminReviews/:id", async (req, res) => {
      const id = req.params.id;

      try {
        // find the review first
        const review = await reviewsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!review) {
          return res.status(404).send({ message: "Review not found" });
        }

        // delete from reviews collection
        const result = await reviewsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (!result.deletedCount) {
          return res.status(500).send({ message: "Failed to delete review" });
        }

        res.send({
          message: "Review deleted from reviews & user profile (if any)",
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Error deleting review" });
      }
    });

    // Offers
    app.post("/offers", async (req, res) => {
      const {
        propertyId,
        offerAmount,
        buyerEmail,
        buyerName,
        buyingDate,
        agentEmail,
        images,
      } = req.body;

      if (
        !propertyId ||
        !offerAmount ||
        !buyerEmail ||
        !buyerName ||
        !buyingDate ||
        !agentEmail
      ) {
        return res.status(400).send({ message: "All fields are required" });
      }

      const property = await myProperty.findOne({
        _id: new ObjectId(propertyId),
      });
      if (!property) {
        return res.status(404).send({ message: "Property not found" });
      }

      const [min, max] = property.priceRange
        .replace(/\$/g, "")
        .split("-")
        .map((v) => +v.trim());
      const offerNum = +offerAmount;

      if (offerNum < min || offerNum > max) {
        return res
          .status(400)
          .send({ message: `Offer must be between ${min} and ${max}` });
      }

      const offer = {
        propertyId,
        propertyTitle: property.title,
        propertyLocation: property.location,
        agentName: property.agentName,
        buyerEmail,
        agentEmail,
        buyerName,
        status: "pending",
        offerAmount: offerNum,
        buyingDate,
        images,
        createdAt: new Date(),
      };

      const result = await offersCollection.insertOne(offer);
      res.status(201).send({ message: "Offer submitted", result });
    });

    // GET all offers made by a buyer
    app.get("/buyer-offers", async (req, res) => {
      const { buyerEmail } = req.query;

      if (!buyerEmail) {
        return res.status(400).send({ message: "buyerEmail is required" });
      }

      const offers = await offersCollection
        .find({ buyerEmail })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(offers);
    });

    //---------------------------------------

    app.get("/top-agent", async (req, res) => {
      try {
        // 1. Find a top agent (agent with role, not fraud)
        const topAgent = await usersCollection.findOne({
          role: "agent",
          status: { $ne: "fraud" },
        });

        if (!topAgent)
          return res.status(404).send({ message: "No agent found" });

        //  Count properties added by this agent
        const propertyCount = await myProperty.countDocuments({
          agentEmail: topAgent.email,
        });

        //  Send response with agent info + total properties
        res.send({
          name: topAgent.name,
          email: topAgent.email,
          image: topAgent.image,
          totalProperties: propertyCount,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    //---------------------------------------------------
    // GET all offers for an agent
    app.get("/agent-offers", async (req, res) => {
      const { agentEmail } = req.query;

      if (!agentEmail) {
        return res.status(400).send({ message: "agentEmail is required" });
      }

      const offers = await offersCollection
        .find({ agentEmail })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(offers);
    });

    // PATCH to update offer status
    app.patch("/offers/:id/status", async (req, res) => {
      const id = req.params.id;
      const { status, propertyId } = req.body;

      if (!["accepted", "rejected"].includes(status)) {
        return res.status(400).send({ message: "Invalid status" });
      }

      try {
        const result = await offersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (status === "accepted") {
          await offersCollection.updateMany(
            {
              propertyId,
              _id: { $ne: new ObjectId(id) },
            },
            { $set: { status: "rejected" } }
          );
        }

        res.send({ message: `Offer ${status}`, result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update offer" });
      }
    });
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
