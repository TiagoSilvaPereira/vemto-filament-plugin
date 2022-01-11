module.exports = (vemto) => {

    return {
        crudRepository: [],

        beforeCodeGenerationStart() {
            let phpVersionBuffer = vemto.executePhp('-r "echo PHP_VERSION;"'),
                phpVersion = phpVersionBuffer.toString()

            if(phpVersion && phpVersion.localeCompare("8.0.0", undefined, { numeric: true }) < 0) {
                vemto.log.error('[FILAMENT ERROR] You have a smaller PHP version than recommended to use the Filament v2 (>= 8.0)')
                vemto.generator.abort()
            }
        },

        canInstall() {
            let appVersion = vemto.getProject().version

            if(appVersion.localeCompare("1.0.4", undefined, { numeric: true }) < 0) {
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
            let basePath = 'app/Filament/Resources'
                
            vemto.log.message('Generating Filament Resources...')

            this.crudRepository.forEach(crud => {
                let crudModelRelationships = this.getAllRelationshipsFromModel(crud.model),
                    modelRelationshipsManager = this.getCrudModelRelationshipsManager(crud, crudModelRelationships)

                let options = this.getOptionsForRenderingResources(crud)

                vemto.renderTemplate('files/FilamentResource.vemtl', `${basePath}/${crud.model.name}Resource.php`, options)
                vemto.renderTemplate('files/pages/Edit.vemtl', `${basePath}/${crud.model.name}Resource/Pages/Edit${crud.model.name}.php`, options)
                vemto.renderTemplate('files/pages/List.vemtl', `${basePath}/${crud.model.name}Resource/Pages/List${crud.model.plural}.php`, options)
                vemto.renderTemplate('files/pages/Create.vemtl', `${basePath}/${crud.model.name}Resource/Pages/Create${crud.model.name}.php`, options)

                if(!modelRelationshipsManager.length) return

                this.renderRelationshipsManager(modelRelationshipsManager, crud, basePath)
            })
        },

        renderRelationshipsManager(modelRelationshipsManager, crud, basePath) {
            modelRelationshipsManager.forEach(rel => {
                let relModelCrud = this.crudRepository.find(crudData => crudData.model.id === rel.model.id)

                if(!relModelCrud) return

                let relationshipOptions = this.getOptionsForRenderingResources(relModelCrud, true, rel, crud.model)

                vemto.renderTemplate('files/ResourceManager.vemtl', 
                    `${basePath}/${crud.model.name}Resource/RelationManagers/${rel.model.plural.case('pascalCase')}RelationManager.php`,
                    relationshipOptions
                )
            })
        },

        getOptionsForRenderingResources(crud, isRelationManager = false, rel = {}, inverseRelationshipModel = {}) {
            let options = {
                formatAs: 'php',
                data: {
                    crud,
                    getTypeForFilament: this.getTypeForFilament,
                    getTableType: input => this.getTableType(input),
                    crudHasTextInputs: this.crudHasTextInputs(crud),
                    crudTableInputs: this.getInputsForTable(crud),
                    getRelationshipInputName: input => this.getRelationshipInputName(input),
                },
                modules: [
                    { name: 'crud', id: crud.id },
                    { name: 'crud-settings', id: crud.id }
                ]
            }

            if(isRelationManager) {
                options.data.inverseRelationshipModel = inverseRelationshipModel
                options.data.relationshipType = rel.type.case('pascalCase')

                return options
            }

            let crudModelRelationships = this.getAllRelationshipsFromModel(crud.model)

            options.data.crudModelRelationships = crudModelRelationships
            options.data.modelRelationshipsManager = this.getCrudModelRelationshipsManager(crud, crudModelRelationships)

            return options
        },

        getCrudModelRelationshipsManager(crud, crudModelRelationships) {
            let crudPluginData = vemto.getPluginData().cruds,
                relationshipsAllowedByFilament = ['morphMany', 'hasMany', 'belongsToMany']

            return crudModelRelationships.filter(relationship => {
                if(!relationshipsAllowedByFilament.includes(relationship.type)) {
                    return false
                }

                if(crud.pluginConfig.isMasterDetail) {
                    return true
                }

                let relationshipDataExists = crudPluginData[crud.id].relationships[relationship.id]

                return this.crudRepository.some(crud => crud.model.id == relationship.model.id)
                    && (relationshipDataExists && relationshipDataExists.selected)
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

        beforeRunnerEnd() {
            let projectSettings = vemto.getProject()
        
            vemto.openLink(`${projectSettings.url}/admin`)
        },
    }
}