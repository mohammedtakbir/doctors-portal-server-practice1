const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;

//* middleware 
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('doctors portal practice1 server is running')
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.drjbcpx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        const appointmentOptionCollection = client.db('doctorsPortalPractice1').collection('appointmentOptions');
        const bookingCollection = client.db('doctorsPortalPractice1').collection('bookings');

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



    }
    finally {

    }
}
run().catch(err => console.error(err))




app.listen(port, () => {
    console.log(`doctors portal practice1 server is running on ${port} port`)
})