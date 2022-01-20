module.exports = (vemto) => {

    return {
        crudRepository: [],

        beforeCodeGenerationStart() {
            let phpVersionBuffer = vemto.executePhp('-r "echo PHP_VERSION;"'),
                phpVersion = phpVersionBuffer.toString()

            if(vemto.versionIsSmallerThan(phpVersion, '8.0.0')) {
                vemto.log.error('[FILAMENT ERROR] You have a smaller PHP version than recommended to use the Filament v2 (>= 8.0)')
                vemto.generator.abort()
            }
        },

        canInstall() {
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
                allSelected: true,
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

        composerPackages(packages) {
            if(this.projectHasFilamentInstalled()) {
                return packages
            }
            
            packages.require['filament/filament'] = '^2.0'

            return packages
        },

        projectHasFilamentInstalled() {
            return vemto.projectFolderExists('/app/Filament')
        },

        beforeCodeGenerationEnd() {
            if(!this.projectHasFilamentInstalled()) {
                vemto.log.message('Installing the Laravel Filament package...')
                vemto.executeComposer('update')
            }

            let selectedCruds = this.crudsSelectedForFilament()

            if(!selectedCruds.length) return

            this.addSelectedCrudsToRepository(selectedCruds)

            this.crudRepository.forEach(crud => {
                this.resolveCrudRelationships(crud)
            })

            this.generateFilamentFiles()
        },

        beforeRenderModel(template, content) {
            if(this.projectHasFilamentInstalled()) {
                return content
            }

            let data = template.getData(),
                model = data.model

            if(model.name == 'User') {
                return this.prepareUserModel(content, model)
            }

            return content
        },

        prepareUserModel(content, model) {
            this.renderFilamentTrait()

            return this.addFilamentTraitToUserModel(content, model)
        },

        renderFilamentTrait() {
            let basePath = 'app/Models/Traits/',
                options = {
                    formatAs: 'php'
                }

            vemto.renderTemplate('files/traits/FilamentTrait.vemtl', `${basePath}/FilamentTrait.php`, options)
        },

        addFilamentTraitToUserModel(content, model) {
            let phpFile = vemto.parsePhp(content)
            
            vemto.log.message(`Adding Filament trait to ${model.name} model...`)

            phpFile.addUseStatement('App\\Models\\Traits\\FilamentTrait')
            phpFile.addUseStatement('Filament\\Models\\Contracts\\FilamentUser')

            phpFile.onClass(model.name).addTrait('FilamentTrait')

            let fileCode = phpFile.getCode(),
                finalCode = fileCode.replace(
                    'class User extends Authenticatable',
                    'class User extends Authenticatable implements FilamentUser'
                )
            
            return finalCode
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

        resolveCrudRelationships(crud, crudIsFromPluginConfig = true) {
            let relationships = this.getAllRelationshipsFromModel(crud.model)

            relationships.forEach(rel => {
                let crudRelationshipData = crud.pluginConfig.relationships 
                    ? crud.pluginConfig.relationships[rel.id]
                    : null

                let relationshipIsNotSelected = !crudRelationshipData || !crudRelationshipData.selected

                if(crudIsFromPluginConfig && relationshipIsNotSelected) return

                let relModelCrud = rel.model.getMainCruds()[0],
                    crudModelExistsOnRepository = this.crudRepository.find(crud => crud.model.id === rel.model.id)

                if(crudModelExistsOnRepository) return

                if(!relModelCrud) {
                    relModelCrud = vemto.createFakeCrudFromModel(rel.model)
                }

                relModelCrud = this.generatePluginConfigForCrud(relModelCrud, true, {}, true)

                this.crudRepository.push(relModelCrud)

                this.resolveCrudRelationships(relModelCrud, false)
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

                let options = this.getOptionsForFilamentResource(crud)

                vemto.renderTemplate('files/FilamentResource.vemtl', `${basePath}/${crud.model.name}Resource.php`, options)
                vemto.renderTemplate('files/pages/Edit.vemtl', `${basePath}/${crud.model.name}Resource/Pages/Edit${crud.model.name}.php`, options)
                vemto.renderTemplate('files/pages/List.vemtl', `${basePath}/${crud.model.name}Resource/Pages/List${crud.model.plural}.php`, options)
                vemto.renderTemplate('files/pages/Create.vemtl', `${basePath}/${crud.model.name}Resource/Pages/Create${crud.model.name}.php`, options)

                if(!modelRelationshipsManager.length) return

                this.generateRelationshipsManager(modelRelationshipsManager, crud, basePath)
            })
        },

        generateRelationshipsManager(modelRelationshipsManager, crud, basePath) {
            modelRelationshipsManager.forEach(rel => {
                let relModelCrud = this.crudRepository.find(crudData => crudData.model.id === rel.model.id)

                if(!relModelCrud) return

                let relationshipOptions = this.getOptionsForFilamentResource(relModelCrud, true, rel, crud.model)

                vemto.renderTemplate('files/ResourceManager.vemtl', 
                    `${basePath}/${crud.model.name}Resource/RelationManagers/${rel.model.plural.case('pascalCase')}RelationManager.php`,
                    relationshipOptions
                )
            })
        },

        getOptionsForFilamentResource(crud, isRelationManager = false, rel = {}, inverseRelationshipModel = {}) {
            let options = {
                formatAs: 'php',
                data: {
                    crud,
                    getTypeForFilament: this.getTypeForFilament,
                    crudTableInputs: this.getInputsForTable(crud),
                    crudHasTextInputs: this.crudHasTextInputs(crud),
                    getTableType: input => this.getTableType(input),
                    getRelationshipInputName: input => this.getRelationshipInputName(input),
                },
                modules: [
                    { name: 'crud', id: crud.id },
                    { name: 'crud-settings', id: crud.id }
                ]
            }

            if(isRelationManager) {
                options.data.relationshipType = rel.type.case('pascalCase')
                options.data.inverseRelationshipModel = inverseRelationshipModel
                options.data.relationshipInputs = crud.inputs.filter(input => input.relationshipId != rel.id)

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

                let relationshipData = crudPluginData[crud.id].relationships[relationship.id]
                    ? crudPluginData[crud.id].relationships[relationship.id]
                    : null

                if(!relationshipData) {
                    return false
                }

                let repositoryHasCrudForRelModel = this.crudRepository.some(crud => crud.model.id == relationship.model.id)

                return repositoryHasCrudForRelModel && relationshipData.selected
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
                dateAndDatetimeInputs = crud.getDateAndDatetimeInputs(),
                imageInputs = crud.getImageInputs()

            return [].concat(
                textInputs, booleanInputs, belongsToInputs, dateAndDatetimeInputs, imageInputs
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