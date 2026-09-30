/**
 * The GIS base map, shared by the GIS Map page and the small map on an
 * account's page: MapLibre set up once (worker, PMTiles), and the style —
 * the offline street map the server keeps (poseidon-api maps/), or the
 * online OpenStreetMap tiles until it's downloaded, plus satellite (online).
 */
import * as maplibregl from "maplibre-gl";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Protocol } from "pmtiles";
import { layers as protomapsLayers, namedFlavor } from "@protomaps/basemaps";
import type { BasemapStatus } from "./gisShared";

let ready = false;
export function ensureMapLibre() {
  if (ready) return;
  // MapLibre 6 looks for its worker beside its own file, which isn't there
  // once Vite has bundled the app — the map then stays grey ("Worker failed
  // to load"). Vite bundles the worker separately and says where it is.
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  ready = true;
}

const ONLINE_GLYPHS = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";

export function buildStyle(b: BasemapStatus): StyleSpecification {
  const origin = window.location.origin;
  const offline = b.installed;
  const sources: StyleSpecification["sources"] = {
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  };
  let base: LayerSpecification[];
  if (offline) {
    sources.protomaps = {
      type: "vector", url: `pmtiles://${origin}/map-data/basemap.pmtiles`,
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };
    base = protomapsLayers("protomaps", namedFlavor("light"), { lang: "en" }) as LayerSpecification[];
  } else {
    sources.osm = {
      type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19,
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };
    base = [{ id: "osm", type: "raster", source: "osm" }];
  }
  return {
    version: 8,
    glyphs: offline && b.fonts ? `${origin}/map-data/fonts/{fontstack}/{range}.pbf` : ONLINE_GLYPHS,
    ...(offline && b.sprites ? { sprite: `${origin}/map-data/sprites/v4/light` } : {}),
    sources,
    layers: [...base, { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } }],
  };
}
