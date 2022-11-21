const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

//* middleware 
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('doctors portal practice1 server is running')
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.drjbcpx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    })

}


async function run() {
    try {
        const appointmentOptionCollection = client.db('doctorsPortalPractice1').collection('appointmentOptions');
        const bookingCollection = client.db('doctorsPortalPractice1').collection('bookings');
        const usersCollection = client.db('doctorsPortalPractice1').collection('users');
        const doctorsCollection = client.db('doctorsPortalPractice1').collection('doctors');
        const paymentsCollection = client.db('doctorsPortalPractice1').collection('payments');

        const adminVerify = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            next();
        }

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1d' });
                return res.send({ token })
            };
            res.status(403).send({ accessToken: '' });
        })

        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {};
            const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);
        })

        app.get('/appointmentOptions', async (req, res) => {
            const query = {};
            const date = req.query.date;
            const options = await appointmentOptionCollection.find(query).toArray();

            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingCollection.find(bookingQuery).toArray();
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlot = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlot.includes(slot))
                option.slots = remainingSlots;
            })
            res.send(options);
        })

        /* 
        ? API naming convention
        * app.get('/bookings')
        * app.get('/bookings/:id')
        * app.post('/bookings')
        * app.patch('/bookings/:id')
        * app.delete('/bookings/:id')
        */

        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking)
        })

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                treatment: booking.treatment,
                email: booking.email
            }
            const alreadyBooked = await bookingCollection.find(query).toArray();
            if (alreadyBooked.length) {
                const message = `You already have booking on ${booking.appointmentDate}`;
                return res.send({ acknowledged: false, message })
            }
            const result = await bookingCollection.insertOne(booking);
            res.send(result);
        })

        //* load user specific booking
        app.get('/bookings', verifyJWT, async (req, res) => {
            const userEmail = req.query.email;
            const decodedEmail = req.decoded.email;
            if (userEmail !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            const query = { email: userEmail };
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        })

        //* store user information
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        //* load all users from usersCollection
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        })

        //* find admin
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' })
        })

        //* make admin
        app.put('/users/admin/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;

            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            };
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result)
        })

        app.post('/doctors', verifyJWT, adminVerify, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        })

        app.get('/doctors', verifyJWT, adminVerify, async (req, res) => {
            const query = {};
            const result = await doctorsCollection.find(query).toArray();
            res.send(result);
        })

        app.delete('/doctors/:id', verifyJWT, adminVerify, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await doctorsCollection.deleteOne(query);
            res.send(result)
        })

        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                "payment_method_types": [
                    "card"
                ],
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const id = payment.bookingId;
            const transactionId = payment.transactionId;
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: transactionId
                }
            };
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            const result = await paymentsCollection.insertOne(payment);
            res.send(result);
        })


        //* temporary to update price field on appointment options
        /* app.get('/addPrice', async (req, res) => {
            const filter = {};
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    price: 99
                }
            };
            const result = await appointmentOptionCollection.updateMany(filter, updatedDoc, options);
            res.send(result)
        }) */

    }
    finally {

    }
}
run().catch(err => console.error(err))




app.listen(port, () => {
    console.log(`doctors portal practice1 server is running on ${port} port`)
})