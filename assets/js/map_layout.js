// map_layout.js — будівлі на стартовій мапі (assets/images/map/start_location.webp).
// x, y — центр; w, h — розмір у % від ширини / висоти мапи.
//   buildings — картинки будівель (assets/images/map/bld_*.webp); вони ж — зони кліку
//               (Місто = вхід south_gate «Південний район»). Точки фігурки й дороги — data/routes.js.
//   spots, city — старі координати (не використовуються)
window.RPG = window.RPG || {};
RPG.MAP_LAYOUT = {
  buildings: {
    home:          { x: 9.3,  y: 70.0, w: 10.5, h: 14.2 },
    temple:        { x: 17.6, y: 60.2, w: 9.0,  h: 16.5 },
    village_start: { x: 23.4, y: 46.0, w: 10.5, h: 14.4 },
    tavern:        { x: 40.5, y: 46.9, w: 10.5, h: 14.8 },
    city:          { x: 60.0, y: 16.4, w: 23.0, h: 33.0 },
    forest_path:   { x: 57.6, y: 64.8, w: 12.0, h: 14.0 },
    forest_cave:   { x: 92.8, y: 46.9, w: 12.0, h: 15.5 }
  },
  spots: {
    home:          { x: 9.3,  y: 70.0 },
    temple:        { x: 17.6, y: 60.2 },
    village_start: { x: 23.4, y: 46.0 },
    tavern:        { x: 40.5, y: 46.9 },
    city:          { x: 60.0, y: 27.1, w: 9.3, h: 9.5 },
    forest_path:   { x: 57.6, y: 64.8 },
    forest_cave:   { x: 92.8, y: 46.9 }
  },
  city: {
    north:  { x: 60.0, y: 5.0,  w: 9.3, h: 8.8 },
    trade:  { x: 53.1, y: 16.3, w: 7.0, h: 13.8 },
    center: { x: 60.0, y: 15.6, w: 7.0, h: 11.1 },
    rest:   { x: 66.8, y: 16.4, w: 7.0, h: 13.8 },
    south:  { x: 60.0, y: 27.1, w: 9.3, h: 9.5 }
  }
};
