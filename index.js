const express = require("express");
require("dotenv").config();
const cookieParser = require("cookie-parser");

const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//-----------------------------------

//----------------------------
const app = express();
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://flourishing-kelpie-5b7554.netlify.app",
    "https://leaflinik.netlify.app/",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

const port = process.env.PORT || 3000;

//----------------------------------------

app.get("/", (req, res) => {
  res.send("✅ Server is running!");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hqw7wrn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const myDB = client.db("assignment_property");

const plantCollection = myDB.collection("plants");

async function run() {
  try {
    app.get("/plants", async (req, res) => {
      try {
        const result = await plantCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to get plants" });
      }
    });

    app.get("/plants/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await plantCollection.findOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to get plant" });
      }
    });

    app.get("/my-plants", async (req, res) => {
      const userEmail = req.query.email;

      if (!userEmail) {
        return res.status(400).send({ message: "Email required" });
      }

      const result = await plantCollection.find({ userEmail }).toArray();
      res.send(result);
    });

    app.post("/plants", async (req, res) => {
      const plant = req.body;

      try {
        const result = await plantCollection.insertOne(plant);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to add plant" });
      }
    });

    // UPDATE plant by ID
    app.put("/plants/:id", async (req, res) => {
      const { id } = req.params;
      const updatedPlant = req.body;

      try {
        const result = await plantCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedPlant }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Plant not found" });
        }

        res.send({
          message: "Plant updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to update plant" });
      }
    });

    app.delete("/plants/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await plantCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to delete plant" });
      }
    });
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
