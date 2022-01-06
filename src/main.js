module.exports = (vemto) => {

    return {
        crudsSelectedForFilament() {
            let pluginData = vemto.getPluginData(),
                hasCrudForGenerate = pluginData.cruds.find(crud => crud && crud.selected)

            if(!hasCrudForGenerate) {
                vemto.log.error('Select a CRUD on the plugin page for generating a Filament Resource')
                return []
            }

            return pluginData.cruds
        },

        onInstall() {
            vemto.savePluginData({
                cruds: this.generateCrudsData()
            })
        },

        generateCrudsData() {
            let projectCruds = vemto.getProject().getMainCruds(),
                crudsData = []

            projectCruds.forEach(crud => {
                let crudData = { 'selected': false, 'inputs': false, 'relationships': [] },
                    crudRelationships = this.getAllRelationshipsFromModel(crud.model)

                if(crudRelationships.length) {
                    crudRelationships.forEach(rel => {
                        crudData.relationships[rel.id] = false
                    })
                }

                crudsData[crud.id] = crudData
            })
            
            return crudsData.map(crud => crud)
        },

        beforeCodeGenerationEnd() {
            let selectedCruds = this.crudsSelectedForFilament()

            if(!selectedCruds.length) return

            selectedCruds = Object.keys(selectedCruds).filter(crud => selectedCruds[crud] && selectedCruds[crud].selected)

            this.generateFilamentFiles(selectedCruds)
        },

        generateFilamentFiles(selectedCruds) {
            let basePath = 'app/Filament/Resources',
                options = {
                    formatAs: 'php',
                    data: {}
                }
                
            vemto.log.message('Generating Filament Resources...')

            let projectCruds = vemto.getProject().getMainCruds()

            selectedCruds.forEach(crudId => {
                let crud = projectCruds.find(crud => crud.id == crudId)

                if(!crud) return

                options.data = {
                    crud,
                    crudHasTextInputs: this.crudHasTextInputs,
                    getTypeForFilament: this.getTypeForFilament,
                }

                vemto.renderTemplate('files/FilamentResource.vemtl', `${basePath}/${crud.model.name}Resource.php`, options)

                vemto.renderTemplate('files/pages/Create.vemtl', `${basePath}/${crud.model.name}Resource/Pages/Create${crud.model.name}.php`, options)
                vemto.renderTemplate('files/pages/Edit.vemtl', `${basePath}/${crud.model.name}Resource/Pages/Edit${crud.model.name}.php`, options)
                vemto.renderTemplate('files/pages/List.vemtl', `${basePath}/${crud.model.name}Resource/Pages/List${crud.model.plural}.php`, options)
            })
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