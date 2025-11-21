import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { COLORS } from '../../constants/colors';

const MAPBOX_KEY = process.env.REACT_APP_MAPBOX_KEY || '';

export interface IMapCoords {
  lat: number;
  lng: number;
}

export interface MapMarkerDetails extends IMapCoords {
  location?: string;
  temperature?: { value: number; units: string } | null;
  wind_speed?: { value: number; units: string } | null;
  daysSinceRain?: number | null;
}

// const P2COORDS: IMapCoords = { lat: -10, lng: -78.3355236 };
const P2COORDS: IMapCoords = {
  lat: 3,
  lng: -80,
};
const DEFAULT_GLOBAL_ZOOM = 2;
const AUTO_ROTATION_DEG_PER_SEC = 3;

const normalizeLongitude = (lng: number) => {
  const wrapped = (((lng + 180) % 360) + 360) % 360;
  return wrapped - 180;
};

export const MBox = ({
  isLargeScreen,
  setIsLoading,
  focusCoords,
  marker,
}: {
  isLargeScreen: boolean;
  setIsLoading: (loading: boolean) => void;
  focusCoords: IMapCoords | null;
  marker: MapMarkerDetails | null;
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const rotationFrameRef = useRef<number | null>(null);
  const rotationLastTimestampRef = useRef<number | null>(null);
  const isRotationActiveRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_KEY;
    if (mapContainerRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/dark-v10',
        attributionControl: false,
        center: [P2COORDS.lng, P2COORDS.lat],
        zoom: DEFAULT_GLOBAL_ZOOM,
        pitch: 0,
        bearing: 0,
        projection: { name: 'globe' },
      });
      mapRef.current.addControl(
        new mapboxgl.NavigationControl({ visualizePitch: true }),
        'top-right'
      );
      mapRef.current.on('load', () => {
        mapRef.current?.setFog({
          range: [0.65, 8],
          color: 'rgba(7, 11, 25, 0.8)',
          'high-color': 'rgba(86, 206, 255, 0.25)',
          'space-color': '#020817',
          'star-intensity': 0.5,
        });
        setIsMapReady(true);
        setIsLoading(false);
      });
    }
    return () => {
      markerRef.current?.remove();
      popupRef.current?.remove();
      mapRef.current && mapRef.current.remove();
      markerRef.current = null;
      popupRef.current = null;
      isRotationActiveRef.current = false;
      if (rotationFrameRef.current !== null) {
        window.cancelAnimationFrame(rotationFrameRef.current);
        rotationFrameRef.current = null;
      }
      setIsMapReady(false);
    };
  }, [setIsLoading]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) {
      return;
    }

    const map = mapRef.current;
    const cancelRotation = () => {
      isRotationActiveRef.current = false;
      if (rotationFrameRef.current !== null) {
        window.cancelAnimationFrame(rotationFrameRef.current);
        rotationFrameRef.current = null;
      }
      rotationLastTimestampRef.current = null;
    };

    map.jumpTo({
      center: [P2COORDS.lng, P2COORDS.lat],
      bearing: 0,
      pitch: 0,
      zoom: DEFAULT_GLOBAL_ZOOM,
    });

    const rotateStep = (timestamp: number) => {
      // Check if rotation is still active before continuing
      if (!mapRef.current || !isRotationActiveRef.current) {
        return;
      }

      if (rotationLastTimestampRef.current === null) {
        rotationLastTimestampRef.current = timestamp;
      }

      const deltaMs = timestamp - rotationLastTimestampRef.current;
      rotationLastTimestampRef.current = timestamp;

      const deltaDegrees = (deltaMs / 1000) * AUTO_ROTATION_DEG_PER_SEC;
      const currentCenter = mapRef.current.getCenter();
      const nextLng = normalizeLongitude(currentCenter.lng + deltaDegrees);

      mapRef.current.setCenter([nextLng, currentCenter.lat]);

      const currentBearing = mapRef.current.getBearing();
      if (Math.abs(currentBearing) > 0.0001) {
        mapRef.current.setBearing(0);
      }

      const currentPitch = mapRef.current.getPitch();
      if (Math.abs(currentPitch) > 0.0001) {
        mapRef.current.setPitch(0);
      }

      // Only schedule next frame if rotation is still active
      if (isRotationActiveRef.current) {
        rotationFrameRef.current = window.requestAnimationFrame(rotateStep);
      }
    };

    const startRotation = () => {
      cancelRotation();
      rotationLastTimestampRef.current = null;
      isRotationActiveRef.current = true;
      rotationFrameRef.current = window.requestAnimationFrame(rotateStep);
    };

    const interactionEvents: Array<
      | 'mousedown'
      | 'touchstart'
      | 'wheel'
      | 'dragstart'
      | 'rotatestart'
      | 'pitchstart'
    > = [
      'mousedown',
      'touchstart',
      'wheel',
      'dragstart',
      'rotatestart',
      'pitchstart',
    ];

    const stopRotation = () => {
      cancelRotation();
      interactionEvents.forEach((event) => map.off(event, stopRotation));
    };

    // Allow the user to take over rotation on any interaction.
    interactionEvents.forEach((event) => map.on(event, stopRotation));

    startRotation();

    return () => {
      cancelRotation();
      interactionEvents.forEach((event) => map.off(event, stopRotation));
    };
  }, [isMapReady]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;
    if (!marker) {
      markerRef.current?.remove();
      popupRef.current?.remove();
      markerRef.current = null;
      popupRef.current = null;
      return;
    }
    const { lat, lng } = marker;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    const map = mapRef.current;
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: COLORS.crimson });
    }
    markerRef.current.setLngLat([lng, lat]).addTo(map);
    if (!popupRef.current) {
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        offset: 18,
        maxWidth: '260px',
      });
    }
    const popupEl = document.createElement('div');
    popupEl.className = 'map-marker-popup';
    popupEl.style.backgroundColor = COLORS.slate900;
    popupEl.style.border = `1px solid ${COLORS.skyBlue}`;
    popupEl.style.borderRadius = '6px';
    popupEl.style.padding = '8px 12px';
    popupEl.style.color = COLORS.white;
    popupEl.style.fontSize = '13px';
    popupEl.style.fontFamily = 'Assistant, sans-serif';
    popupEl.style.boxShadow = `0 4px 12px rgba(0, 0, 0, 0.3)`;

    const titleEl = document.createElement('div');
    titleEl.style.fontWeight = '600';
    titleEl.style.color = COLORS.white;
    titleEl.style.marginBottom = '4px';
    titleEl.textContent =
      marker.location && marker.location.trim().length
        ? marker.location
        : `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    popupEl.appendChild(titleEl);

    const coordEl = document.createElement('div');
    coordEl.style.fontSize = '11px';
    coordEl.style.color = COLORS.skyBlue;
    coordEl.style.opacity = '0.8';
    coordEl.textContent = `Lat ${lat.toFixed(2)} · Lng ${lng.toFixed(2)}`;
    popupEl.appendChild(coordEl);
    if (marker.temperature) {
      const tempEl = document.createElement('div');
      tempEl.style.fontSize = '12px';
      tempEl.style.color = COLORS.white;
      tempEl.style.marginTop = '3px';
      tempEl.textContent = `Temp: ${marker.temperature.value.toFixed(1)} ${
        marker.temperature.units
      }`;
      popupEl.appendChild(tempEl);
    }
    if (marker.wind_speed) {
      const windEl = document.createElement('div');
      windEl.style.fontSize = '12px';
      windEl.style.color = COLORS.white;
      windEl.style.marginTop = '3px';
      windEl.textContent = `Wind: ${marker.wind_speed.value.toFixed(1)} ${
        marker.wind_speed.units
      }`;
      popupEl.appendChild(windEl);
    }
    if (marker.daysSinceRain !== undefined && marker.daysSinceRain !== null) {
      const rainEl = document.createElement('div');
      rainEl.style.fontSize = '12px';
      rainEl.style.color = COLORS.white;
      rainEl.style.marginTop = '3px';
      rainEl.textContent =
        marker.daysSinceRain === -1
          ? 'No rain in the past 10+ days'
          : `Days since rain: ${marker.daysSinceRain}`;
      popupEl.appendChild(rainEl);
    }
    popupRef.current.setDOMContent(popupEl);
    markerRef.current.setPopup(popupRef.current);
    popupRef.current.addTo(map);
  }, [marker, isMapReady]);

  // Keep updating the map view based on coords
  useEffect(() => {
    if (!mapRef.current || !isMapReady || !focusCoords) return;

    // Cancel the auto-rotation so flyTo can work properly
    isRotationActiveRef.current = false;
    if (rotationFrameRef.current !== null) {
      window.cancelAnimationFrame(rotationFrameRef.current);
      rotationFrameRef.current = null;
      rotationLastTimestampRef.current = null;
    }

    mapRef.current.flyTo({
      center: [focusCoords.lng, focusCoords.lat],
      zoom: isLargeScreen ? 6 : 5,
      essential: true,
    });
  }, [focusCoords, isLargeScreen, isMapReady]);

  useEffect(() => {
    if (!mapRef.current || !isMapReady || focusCoords) return;
    mapRef.current.flyTo({
      center: [P2COORDS.lng, P2COORDS.lat],
      zoom: DEFAULT_GLOBAL_ZOOM,
      pitch: 0,
      essential: false,
    });
  }, [isMapReady, focusCoords]);

  return (
    <div
      className="h-full"
      style={{
        background:
          'radial-gradient(circle at 20% 20%, rgba(14, 165, 233, 0.12), rgba(15, 23, 42, 0.06) 48%, rgba(15, 23, 42, 0) 80%)',
      }}
    >
      <div
        id="map-container"
        ref={mapContainerRef}
        className="h-full w-full"
        style={{ backgroundColor: COLORS.slate900 }}
      />
    </div>
  );
};
