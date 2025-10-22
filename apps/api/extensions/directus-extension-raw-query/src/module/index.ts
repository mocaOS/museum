import { defineModule } from "@directus/extensions-sdk";
import ModuleComponent from "./module.vue";

export default defineModule({
  id: "raw-query",
  name: "Raw Query",
  icon: "code",
  routes: [
    {
      path: "",
      component: ModuleComponent,
    },
  ],
  preRegisterCheck(user: any) {
    return user.admin_access === true;
  },
});
