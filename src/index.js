import jsonld from 'jsonld'
import SHACLValidator from 'shacl'
import modelFrame from 'rdf/model.frame.jsonld'
import modelValidator from 'rdf/model.shacl.ttl'

const validator = SHACLValidator()

export default async function construct_model_from_rdf(rdf) {
  /*
  We construct a frame with the information we'll need
   to construct a model from the rdf.
  */
  await new Promise(
    (resolve, reject) => 
      validator.validate(
        rdf, 'text/turtle',
        modelValidator, 'text/turtle',
        (err, report) => {
          if (err) {
            reject(err)
          } else if (report.conforms() === false) {
            reject(new Exception(JSON.stringify(
              report.results().map(
                (result) => ({
                  severity: result.severity(),
                  sourceConstraintComponent: report.sourceConstraintComponent(),
                })
              )
            )))
          } else {
            resolve()
          }
        }
      )
  )

  const models = jsonld.frame(jsonrdf, modelFrame)['@graph']
  const modelIRIs = new Set(models.map(model => model['sh:targetClass']['@id']))
  const typeorm_models = {}

  for (const model of models) {
    const modelName = model['sh:targetClass']['rdfs:label']
    const modelProps = {
      name: modelName,
      columns: {
        id: {
          primary: true,
          type: 'uuid',
          generated: true,
        }
      },
      relations: {},
      checks: [],
    }
    for (const prop of model['sh:property']) {
      const propName = prop['sh:name']
      if (prop['sh:class'] === null) {
        const propDatatype = xsdToType[prop['sh:datatype']]
        if (prop['sh:minCount'] === 1 && prop['sh:maxCount'] === 1) { // .
          modelProps.columns[propName] = {
            type: propDatatype,
            nullable: false,
          }
        } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] === 1) { // ?
          modelProps.columns[propName] = {
            type: propDatatype,
            nullable: true,
          }
        } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] === undefined) { // *
          modelProps.columns[propName] = {
            type: 'json',
            nullable: true,
          }
          modelProps.checks.append({
            expression: `json_typeof("${propName}") = 'array'`
          })
        } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] > 1) { // +
          modelProps.columns[propName] = {
            type: 'json',
            nullable: true,
          }
          modelProps.checks.append({
            expression: `json_typeof("${propName}") = 'array' and json_array_length("${propName}") >= 1`
          })
        } else if (prop['sh:minCount'] > 0 && prop['sh:maxCount'] === undefined) { // {sh:minCount,}
          modelProps.columns[propName] = {
            type: 'json',
            nullable: true,
          }
          modelProps.checks.append({
            expression: `json_typeof("${propName}") = 'array' and json_array_length("${propName}") >= ${prop['sh:minCount']}`
          })
        } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] > 0) { // {,sh:maxCount}
          modelProps.columns[propName] = {
            type: 'json',
            nullable: true,
          }
          modelProps.checks.append({
            expression: `json_typeof("${propName}") = 'array' and json_array_length("${propName}") <= ${prop['sh:maxCount']}`
          })
        } else if (prop['sh:minCount'] > 0 && prop['sh:maxCount'] > 0) { // {sh:minCount,sh:maxCount}
          modelProps.columns[propName] = {
            type: 'json',
            nullable: true,
          }
          modelProps.checks.append({
            expression: `json_typeof("${propName}") = 'array' and json_array_length("${propName}") >= ${prop['sh:minCount']} and json_array_length("${propName}") <= ${prop['sh:maxCount']}`
          })
        }
      } else {
        // Did we mention another model we have in the database?
        if (modelIRIs.has(prop['sh:class']['@id']) === true) {
          const foreignModelName = prop['sh:class']['rdfs:label']
          if (prop['sh:minCount'] === 1 && prop['sh:maxCount'] === 1) { // .
            modelProps.relations[propName] = {
              type: 'one-to-one',
              target: foreignModelName,
              joinTable: true,
              cascade: true,
              nullable: false,
            }
          } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] === 1) { // ?
            modelProps.relations[propName] = {
              type: 'one-to-one',
              target: foreignModelName,
              joinTable: true,
              cascade: true,
              nullable: true,
            }
          } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] === undefined) { // *
            modelProps.relations[propName] = {
              type: 'many-to-many',
              target: foreignModelName,
              joinTable: true,
              cascade: true,
              nullable: true,
            }
          } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] > 1) { // +
            modelProps.relations[propName] = {
              type: 'many-to-many',
              target: foreignModelName,
              joinTable: true,
              cascade: true,
              nullable: false,
            }
          }
        } else {
          if (prop['sh:minCount'] === 1 && prop['sh:maxCount'] === 1) { // .
            modelProps.relations[propName] = {
              type: 'json',
              nullable: false,
            }
            modelProps.checks.append({
              expression: `json_typeof("${propName}") = 'object'`
            })
          } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] === 1) { // ?
            modelProps.relations[propName] = {
              type: 'json',
              nullable: true,
            }
            modelProps.checks.append({
              expression: `json_typeof("${propName}") = 'object'`
            })
          } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] === undefined) { // *
            modelProps.relations[propName] = {
              type: 'json',
              nullable: true,
            }
            modelProps.checks.append({
              expression: `json_typeof("${propName}") = 'array'`
            })
          } else if (prop['sh:minCount'] === 0 && prop['sh:maxCount'] > 1) { // +
            modelProps.relations[propName] = {
              type: 'json',
              nullable: false,
            }
            modelProps.checks.append({
              expression: `json_typeof("${propName}") = 'array'`
            })
          }
        }
      }
    }
    typeorm_models[modelName] = modelProps
  }
  return typeorm_models
}
