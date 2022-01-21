# Filament Resources

> This is a [Vemto](https://vemto.app/) plugin. Vemto is a GUI [Laravel](https://laravel.com/) generator with a complete set of tools for starting new [Laravel](https://laravel.com/) projects. 

This plugin aims to bring the generation of complete [Filament Admin Panels](https://filamentadmin.com/) to your Vemto Laravel project.

## Requirements

This plugin installs [Filament](https://filamentadmin.com/), and makes the initial configuration. If you already have Filament installed in the project, the plugin will skip the configuration step and generate the [resources](https://filamentadmin.com/docs/2.x/admin/resources).

After installing [Filament](https://filamentadmin.com/), you can just select what resources you want to generate based on your project CRUD applications.

## How it works?

Within the configuration page, you only need to select the main CRUDs that will be generated as a *Filament Resource* (those that will appear in the sidebar).

For each main CRUD, you can select to generate:

- Inputs (will generate the form inputs as Filament inputs, including *BelongsTo* selects)
- Relationships (will generate the *HasMany*, *BelongsToMany* and *MorphMany* relationships)

## How does the resource generation works?

It is necessary to create CRUD applications for the models you want to generate Resources that will appear in the Admin Panel sidebar.

> **Note**: If you want some CRUD not to appear in the Admin Panel sidebar, but in the edit pages of their parent resources, you can uncheck the main CRUD and tag it in the relationships options of any main CRUD. In the lack of a CRUD for the relationship model, the plugin will generate a Resource based on the model data.