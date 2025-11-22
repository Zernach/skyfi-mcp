import { useEffect, useCallback, useState } from 'react';
import { MBox, IMapCoords, MapMarkerDetails } from '../mbox/MBox';
import { RealtimeVoiceModal } from '../realtime-voice/RealtimeVoiceModal';
import { ConsoleHeader } from '../console-header/ConsoleHeader';
import { HackathonWinners } from '../hackathon-winners/HackathonWinners';
import { SlideDeckLightbox } from '../slide-deck-lightbox/SlideDeckLightbox';
import { SLIDE_DECK_URL } from '../../constants/links';
import { ConsoleFooter } from '../console-footer/ConsoleFooter';
import { MapLoadingModal } from '../map-loading-modal/MapLoadingModal';
import { ChatWidget } from '../chat/ChatWidget';
import './dashboard.scss';

export function Dashboard() {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [markerInfo, setMarkerInfo] = useState<MapMarkerDetails | null>(null);
  const [hasInitialLoadStarted, setHasInitialLoadStarted] = useState(false);
  const [mapPosition, setMapPosition] = useState<IMapCoords | null>(null);
  const [isSpaceAppsModalVisible, setIsSpaceAppsModalVisible] = useState(true);
  const [loadingModalState, setLoadingModalState] = useState<
    'loading' | 'success' | 'hidden'
  >('loading');
  const isLargeScreen = windowWidth >= 950;

  const resetRealtimeContext = useCallback(() => {
    setMarkerInfo(null);
    setMapPosition(null);
  }, []);

  const updateMarkerInfo = useCallback((update: Partial<MapMarkerDetails>) => {
    setMarkerInfo((previous) => {
      if (!previous) {
        if (update.lat === undefined || update.lng === undefined) {
          return previous;
        }
        return {
          lat: update.lat,
          lng: update.lng,
          ...update,
        } as MapMarkerDetails;
      }
      return { ...previous, ...update };
    });
  }, []);

  // Add this function to close the lightbox
  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  const dismissSpaceAppsModal = useCallback(() => {
    setIsSpaceAppsModalVisible(false);
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLoading) {
      if (!hasInitialLoadStarted) {
        setHasInitialLoadStarted(true);
      }
      if (loadingModalState !== 'loading') {
        setLoadingModalState('loading');
      }
      return;
    }

    if (
      !isLoading &&
      hasInitialLoadStarted &&
      loadingModalState === 'loading'
    ) {
      setLoadingModalState('success');
    }
  }, [hasInitialLoadStarted, isLoading, loadingModalState]);

  useEffect(() => {
    if (loadingModalState !== 'success') {
      return;
    }
    const hideDelay = window.setTimeout(() => {
      setLoadingModalState('hidden');
    }, 1400);
    return () => window.clearTimeout(hideDelay);
  }, [loadingModalState]);

  const openSlideDeck = useCallback(() => {
    if (isLargeScreen) {
      setIsLightboxOpen(true);
    } else {
      // open SLIDE_DECK_URL in new tab
      window.open(SLIDE_DECK_URL, '_blank');
    }
  }, [isLargeScreen]);

  return (
    <div data-component="Dashboard">
      <ConsoleHeader
        isLargeScreen={isLargeScreen}
        onOpenSlideDeck={openSlideDeck}
      />
      <div className="content-main">
        <div className="content-right">
          <div className="content-block map" style={{ height: '100%' }}>
            <MBox
              isLargeScreen={isLargeScreen}
              setIsLoading={setIsLoading}
              focusCoords={mapPosition}
              marker={markerInfo}
            />
            <MapLoadingModal state={loadingModalState} />
            <HackathonWinners
              isVisible={isSpaceAppsModalVisible}
              onDismiss={dismissSpaceAppsModal}
            />
            <RealtimeVoiceModal
              onMarkerUpdate={updateMarkerInfo}
              onMapPositionChange={setMapPosition}
              onResetContext={resetRealtimeContext}
              isLargeScreen={isLargeScreen}
            />
            <ChatWidget />
          </div>
        </div>
        <ConsoleFooter
          isLargeScreen={isLargeScreen}
          onOpenSlideDeck={openSlideDeck}
        />
      </div>
      <SlideDeckLightbox
        isOpen={isLightboxOpen}
        slideDeckUrl={SLIDE_DECK_URL}
        onClose={closeLightbox}
      />
    </div>
  );
}
