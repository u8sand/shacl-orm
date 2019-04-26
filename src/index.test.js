import test from 'jest'
import typeorm from 'typeorm'
import sql from 'sql.js'
import testModel from './model.test.ttl'
import construct_model_from_rdf from './index'

test('generate', async () => {
  const entities = await construct_model_from_rdf(testModel)
  const connection = await typeorm.createConnection({
    type: 'sqljs',
    location: 'test',
    autoSave: true,
    entities: entities,
    logging: ['query', 'schema'],
    synchronize: true,
  })
  // TODO: test that we can properly utilize the model
})
