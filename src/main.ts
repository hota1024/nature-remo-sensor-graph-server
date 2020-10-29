import * as dotenv from 'dotenv'
dotenv.config()

import { Cloud, ISensorValue } from 'nature-remo'
import * as Influx from 'influx'
import * as SocketIO from 'socket.io'

const client = new Cloud(process.env.NATURE_REMO_TOKEN)

const subscribeRemo = (callback: (value: ISensorValue) => void): void => {
  setInterval(async () => {
    try {
      const sensor = await client.getSensorValue()
      callback(sensor)
    } catch {
      console.log('err')
    }
  }, 10 * 1000)
}

const influx = new Influx.InfluxDB({
  host: 'localhost',
  database: 'remo_sensor_db',
  schema: [
    {
      measurement: 'remo_sensors',
      fields: {
        duration: Influx.FieldType.INTEGER,
        temperature: Influx.FieldType.FLOAT,
      },
      tags: [],
    },
  ],
})

const main = async () => {
  await influx.createRetentionPolicy('1day', {
    duration: '24h',
    replication: 0,
  })

  const io = SocketIO(3001)
  const start = Date.now()

  const names = await influx.getDatabaseNames()
  if (!names.includes('remo_sensor_db')) {
    influx.createDatabase('remo_sensor_db')
  }
  console.log(await influx.query('select * from remo_sensors'))

  io.on('connection', async (socket) => {
    const data = await influx.query('select * from remo_sensors')
    socket.emit('history', data)
  })

  subscribeRemo(async (sensor) => {
    const duration = Date.now() - start
    // io.emit('sensor', { ...sensor, duration })
    console.log(duration)

    await influx.writeMeasurement('remo_sensors', [
      {
        fields: {
          duration,
          temperature: sensor.temperature,
        },
      },
    ])
    const data = await influx.query('select * from remo_sensors')
    io.emit('history', data)
  })
}

main()
