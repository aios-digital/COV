# Notes for Perfex-CRM-style admin apps (from the worked example)

These are specifics of the app the example config targets (`crm-support-module.config.mjs`). Other apps differ; use the scan to find the real ids.

- Sidebar is `#side-menu`; workspace rail buttons are `#mmm-icon-main_menu`, `#mmm-icon-others`, etc. The module lives under a menu group on one of those workspaces.
- Staff ticket form: `Ticket without contact` must be clicked before Name and Email are enabled; `#name` is not unique (scope to `form[action*="tickets/add"]`);
  selects are bootstrap-select (use `h.choose`); the body is TinyMCE (`tinymce.get('message')`); the submit button is "Open Ticket".
- Creating a ticket on the demo takes 30 to 40 s (probably a synchronous notification email). Use the reserved `example.invalid` address so nothing is ever delivered.
- Status changes use the dropdown next to the ticket title (`.dropdown-toggle`, items "In Progress", "Closed"); Add Reply would email the customer, so use Add Note.
