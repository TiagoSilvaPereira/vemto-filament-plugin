module.exports = (vemto) => {

    return {
        crudRepository: [],

        canInstall() {
            let appVersion = vemto.project.version,
                compareOptions = {
                    numeric: false,
                    sensitivity: 'base'
                }

            if(appVersion.localeCompare("1.0.0", undefined, compareOptions) < 0) {
                vemto.addBlockReason('You have a smaller version than recommended to use the plugin')
                return false
            }

            return true
        },

        crudsSelectedForFilament() {
            let pluginData = vemto.getPluginData(),
                hasCrudForGeneration = pluginData.cruds.find(crud => crud && crud.selected)

            if(!hasCrudForGeneration) {
                vemto.log.warning('No have a selected CRUD for generate a Filament Resource.')
                return []
            }

            return pluginData.cruds.filter(crud => crud && crud.selected)
        },

        onInstall() {
            let projectCruds = vemto.getProject().getMainCruds()

            vemto.savePluginData({
                cruds: this.generateCrudsData(projectCruds)
            })
        },

        generateCrudsData(cruds) {
            let crudsData = []

                cruds.forEach(crud => {
                let crudData = { 'selected': true, 'id': crud.id, 'inputs': true, 'relationships': [] },
                    crudRelationships = this.getAllRelationshipsFromModel(crud.model)

                if(crudRelationships.length) {
                    crudRelationships.forEach(rel => {
                        crudData.relationships[rel.id] = { 'selected': true }
                    })
                }

                crudsData[crud.id] = crudData
            })
            
            return crudsData.map(crud => crud)
        },

        beforeCodeGenerationEnd() {
            let selectedCruds = this.crudsSelectedForFilament()

            if(!selectedCruds.length) return

            this.addSelectedCrudsToRepository(selectedCruds)

            this.crudRepository.forEach(crud => {
                this.resolveCrudRelationships(crud)
            })

            this.generateFilamentFiles()
        },

        addSelectedCrudsToRepository(cruds) {
            let projectCruds = vemto.getProject().getMainCruds()

            cruds.forEach(crud => {
                let crudData = projectCruds.find(projectCrud => projectCrud.id === crud.id)

                if(!crudData) return

                crudData = this.generatePluginConfigForCrud(crudData, crud.inputs, crud.relationships, false)

                this.crudRepository.push(crudData)
            })
        },

        resolveCrudRelationships(crud, ignorePluginConfig = false) {
            let relationships = this.getAllRelationshipsFromModel(crud.model)

            relationships.forEach(rel => {
                let crudRelationshipData = crud.pluginConfig.relationships && crud.pluginConfig.relationships[rel.id]

                if(!ignorePluginConfig && (!crudRelationshipData || !crudRelationshipData.selected)) return

                let relModelCrud = rel.model.cruds[0],
                    crudModelExistsOnRepository = this.crudRepository.find(crud => crud.model.id === rel.model.id)

                if(crudModelExistsOnRepository) return

                if(!relModelCrud) {
                    relModelCrud = vemto.createFakeCrudFromModel(rel.model)
                }

                relModelCrud = this.generatePluginConfigForCrud(relModelCrud, true, {}, true)

                this.crudRepository.push(relModelCrud)

                this.resolveCrudRelationships(relModelCrud, true)
            })
        },

        generatePluginConfigForCrud(crud, inputs, relationships, isMasterDetail = false) {
            if(!crud.pluginConfig) {
                crud.pluginConfig = {}
            }

            crud.pluginConfig.inputs = inputs
            crud.pluginConfig.relationships = relationships

            if(isMasterDetail) {
                crud.pluginConfig.isMasterDetail = true
            } else {
                crud.pluginConfig.isSelectedCrud = true
            }

            return crud
        },

        generateFilamentFiles() {
            let basePath = 'app/Filament/Resources',
                options = {
                    formatAs: 'php',
                    data: {}
                }
                
            vemto.log.message('Generating Filament Resources...')

            this.crudRepository.forEach(crud => {
                let crudModelRelationships = this.getAllRelationshipsFromModel(crud.model),
                    crudTableInputs = this.getInputsForTable(crud)

                options.data = {
                    crud,
                    crudTableInputs,
                    crudModelRelationships,
                    crudHasTextInputs: this.crudHasTextInputs,
                    getTypeForFilament: this.getTypeForFilament,
                    getTableType: input => this.getTableType(input),
                    getRelationshipInputName: input => this.getRelationshipInputName(input)
                }

                options.modules = [
                    { name: 'crud', id: crud.id },
                    { name: 'crud-settings', id: crud.id }
                ]

                vemto.renderTemplate('files/FilamentResource.vemtl', `${basePath}/${crud.model.name}Resource.php`, options)
                vemto.renderTemplate('files/pages/Edit.vemtl', `${basePath}/${crud.model.name}Resource/Pages/Edit${crud.model.name}.php`, options)
                vemto.renderTemplate('files/pages/List.vemtl', `${basePath}/${crud.model.name}Resource/Pages/List${crud.model.plural}.php`, options)
                vemto.renderTemplate('files/pages/Create.vemtl', `${basePath}/${crud.model.name}Resource/Pages/Create${crud.model.name}.php`, options)
            })
        },

        getRelationshipInputName(input) {
            let relModel = input.relationship.model,
                relModelLabel = relModel.getLabelFieldName()

            return `${relModel.name.case('camelCase')}.${relModelLabel}`
        },

        getTableType(input) {
            let textInputs = ['email', 'text', 'date', 'datetime']

            if(textInputs.includes(input.type) || input.isForRelationship()) {
                return 'TextColumn'
            }

            if(input.isImage()) {
                return 'ImageColumn'
            }

            if(input.isCheckbox()) {
                return 'BooleanColumn'
            }
        },

        getInputsForTable(crud) {
            let textInputs = this.getTextInputs(crud),
                booleanInputs = crud.getCheckboxInputs(),
                belongsToInputs = crud.getBelongsToInputs(),
                dateAndDatetimeInputs = crud.getDateAndDatetimeInputs()

            return [].concat(
                textInputs, booleanInputs, belongsToInputs, dateAndDatetimeInputs
            )
        },

        getTextInputs(crud) {
            let textInputs = crud.getTextInputs(),
                emailInputs = crud.getEmailInputs()

            return [].concat(
                textInputs, emailInputs
            )
        },

        getTypeForFilament(input) {
            let textInputs = ['email', 'url', 'password', 'text']

            if(textInputs.includes(input.type)) {
                return 'TextInput'
            }
    
            if(input.isForRelationship()) {
                return 'BelongsToSelect'
            }

            if(input.isDate()) return 'DatePicker'
    
            if(input.isCheckbox()) return 'Toggle'

            if(input.isTextarea()) return 'RichEditor'

            if(input.isFileOrImage()) return 'FileUpload'

            if(input.isDatetime()) return 'DateTimePicker'

            return input.type.case('pascalCase')
        },

        crudHasTextInputs(crud){
            return crud.hasTextInputs() || crud.hasEmailInputs() || crud.hasUrlInputs() || crud.hasPasswordInputs()
        },

        getAllRelationshipsFromModel(model) {
            let basicRelationships = model.getAllRelationships(),
                morphRelationships = model.getAllMorphRelationships()

            return [].concat(
                basicRelationships, morphRelationships
            )
        },
    }
}