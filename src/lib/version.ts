// Version de la plateforme : celle de package.json, tenue à jour par release-please à chaque release.
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
