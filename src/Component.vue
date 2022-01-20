<template>
    <div class="w-full">
        <label class="block text-sm font-bold">Filament</label>
        <small class="mb-2">Select the CRUDs to generate a Filament Resource</small>
        
        <div class="mt-5">
            <label class="block text-sm font-bold mb-2">Project CRUDs</label>

            <div class="form-check mb-3">
                <label class="inline-flex items-center" for="selectAllCruds">
                    <input class="form-checkbox" type="checkbox" id="selectAllCruds" @change="selectAllData" v-model="pluginData.allSelected">
                    <span class="ml-2 text-gray-800 dark:text-gray-300">Select All</span>
                </label>
            </div>
            
            <template v-if="pluginData.cruds">
                <div class="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-900 p-2 rounded-md my-3" v-for="crud in projectCruds" :key="'crud' + crud.id">
                    <div class="form-check">
                        <label class="inline-flex items-center text-gray-800" :for="crud.id">
                            <input class="form-checkbox" type="checkbox" v-model="pluginData.cruds[crud.id]['selected']" :id="crud.id" @change="toggleCrudData(crud)">
                            <span class="ml-2 text-gray-800 dark:text-gray-100">{{ crud.name }}</span>
                        </label>
                    </div>
                    <div class="form-check mt-1 ml-3">
                        <label class="inline-flex items-center">
                            <input class="form-checkbox" type="checkbox" v-model="pluginData.cruds[crud.id]['inputs']" @change="save">
                            <span class="ml-2 text-gray-800 dark:text-gray-300">Inputs</span>
                        </label>
                    </div>
                    <small class="mb-1 ml-3">Relationships</small>
                    <div class="form-check my-1 ml-3" v-for="relationship in getAllRelationshipsFromModel(crud.model)" :key="'rel' + relationship.id">
                        <label class="inline-flex items-center">
                            <input class="form-checkbox" type="checkbox" v-model="pluginData.cruds[crud.id]['relationships'][relationship.id].selected" @change="save">
                            <span class="ml-2 text-gray-800 dark:text-gray-300">{{ `${relationship.type.case('pascalCase')} (${relationship.name.case('pascalCase')})` }}</span>
                        </label>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>
<script>
export default {
    data() {
        return {
            projectCruds: [],
            pluginData: [],
            vemtoProject: {}
        }
    },

    created() {
        this.vemtoProject = window.vemtoApi.getProject()
        this.pluginData = window.vemtoApi.getPluginData()
        this.projectCruds = this.vemtoProject.getMainCruds()

        if(this.pluginData.cruds) {
            this.checkNewProjectCruds()
            this.checkNewModelRelationships()
        }
    },

    methods: {
        checkNewModelRelationships() {
            this.projectCruds.forEach(crud => {
                let crudPluginData = this.pluginData.cruds.find(crudData => crudData && crudData.id === crud.id)

                if(!crudPluginData) return

                let crudModelRelationships = this.getAllRelationshipsFromModel(crud.model)

                crudModelRelationships.forEach(rel => {
                    if(!crudPluginData.relationships[rel.id]) {
                        this.$set(this.pluginData.cruds[crud.id].relationships, rel.id, { selected: false })
                    }
                })
            })

            this.save()
        },

        getAllRelationshipsFromModel(model) {
            let basicRelationships = model.getAllRelationships(),
                morphRelationships = model.getAllMorphRelationships()

            return [].concat(
                basicRelationships, morphRelationships
            )
        },

        toggleCrudData(crud) {
            let crudData = this.pluginData.cruds[crud.id]

            if(!crudData || !crudData.relationships) return

            this.$set(crudData, 'inputs', crudData.selected)

            crudData.relationships.forEach((rel, index) => {
                if(!rel) return

                if(!crudData.relationships[index]) return

                this.$set(crudData.relationships[index], 'selected', crudData.selected)
            })

            this.toggleCrudModule(crud.id, crudData.selected)
            this.save()
        },

        selectAllData(event) {
            let isChecked = event.target.checked

            this.pluginData.cruds.forEach((crudData, crudId) => {
                if(!crudData) return

                crudData.selected = isChecked
                crudData.inputs = isChecked

                this.toggleCrudModule(crudId, isChecked)

                crudData.relationships.forEach((rel, index) => {
                    if(!rel) return
                    
                    crudData.relationships[index].selected = isChecked
                })
            })

            this.save()
        },

        toggleCrudModule(crudId, selected) {
            if(selected) {
                this.vemtoProject.purgeRemovedModule('crud-settings', crudId)
                return
            }

            this.vemtoProject.registerRemovedModule('crud-settings', crudId)
        },
        
        checkNewProjectCruds() {
            this.projectCruds.forEach(crud => {
                if(this.pluginData.cruds[crud.id]) return

                let crudData = { 'selected': false, id: crud.id, 'inputs': false, 'relationships': [] },
                    crudRelationships = this.getAllRelationshipsFromModel(crud.model)

                if(crudRelationships.length) {
                    crudRelationships.forEach(rel => {
                        crudData.relationships[rel.id] = {}
                        crudData.relationships[rel.id].selected = false
                    })
                }

                this.$set(this.pluginData.cruds, crud.id, crudData)
            })

            this.save()
        },

        save: window.vemtoApi.debounce(function() {
            window.vemtoApi.savePluginData({
                cruds: this.pluginData.cruds,
                allSelected: this.pluginData.allSelected
            })
        }, 300)
    }
}
</script>