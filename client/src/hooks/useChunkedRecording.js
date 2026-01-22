import { useState, useRef, useCallback, useEffect } from 'react';

const DEFAULT_CHUNK_DURATION_SECONDS = 5 * 60; // 5 minutes in seconds

/**
 * Hook for managing chunked audio recording with automatic splitting
 * When recording exceeds the chunk duration, it automatically splits and starts processing
 * the completed chunk while continuing to record
 */
export function useChunkedRecording({
  onChunkReady,
  onAllChunksComplete,
  chunkDurationSeconds = DEFAULT_CHUNK_DURATION_SECONDS
}) {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentChunkTime, setCurrentChunkTime] = useState(0);

  // Chunk tracking
  const [totalChunks, setTotalChunks] = useState(0);
  const [completedChunks, setCompletedChunks] = useState([]);
  const [failedChunks, setFailedChunks] = useState([]);
  const [processingChunks, setProcessingChunks] = useState([]);

  // Session state
  const [sessionActive, setSessionActive] = useState(false);

  // Refs for mutable state
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const chunkCounterRef = useRef(0);
  const currentChunkTimeRef = useRef(0);
  const pendingChunksRef = useRef([]); // Store chunks waiting to be processed
  const isStoppedRef = useRef(false);
  const onChunkReadyRef = useRef(onChunkReady);
  const onAllChunksCompleteRef = useRef(onAllChunksComplete);
  const lastAudioLevelUpdateRef = useRef(0); // Throttle audio level updates

  // Keep callback refs updated
  useEffect(() => {
    onChunkReadyRef.current = onChunkReady;
    onAllChunksCompleteRef.current = onAllChunksComplete;
  }, [onChunkReady, onAllChunksComplete]);

  // Cleanup audio context
  const cleanupAudioContext = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Setup audio level monitoring
  const setupAudioLevelMonitoring = useCallback((stream) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      const updateAudioLevel = () => {
        if (!analyserRef.current) return;

        // Throttle updates to every 100ms to prevent excessive re-renders
        const now = Date.now();
        if (now - lastAudioLevelUpdateRef.current >= 100) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(Math.min(100, average * 1.5));
          lastAudioLevelUpdateRef.current = now;
        }

        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();
    } catch (e) {
      console.warn('Audio level monitoring not available:', e);
    }
  }, []);

  // Process a single chunk
  const processChunk = useCallback(async (chunkBlob, chunkIndex, duration) => {
    console.log(`Processing chunk ${chunkIndex}, size: ${chunkBlob.size}, duration: ${duration}s`);

    setProcessingChunks(prev => [...prev, chunkIndex]);

    try {
      if (onChunkReadyRef.current) {
        const result = await onChunkReadyRef.current(chunkBlob, chunkIndex, duration);
        setCompletedChunks(prev => [...prev, { index: chunkIndex, result, duration }]);
        console.log(`Chunk ${chunkIndex} completed successfully`);
        return { success: true, result };
      }
      return { success: true };
    } catch (error) {
      console.error(`Chunk ${chunkIndex} failed:`, error);
      setFailedChunks(prev => [...prev, { index: chunkIndex, error: error.message }]);
      return { success: false, error };
    } finally {
      setProcessingChunks(prev => prev.filter(i => i !== chunkIndex));
    }
  }, []);

  // Create and setup a new MediaRecorder
  const createAndStartRecorder = useCallback((stream, onDataAvailable) => {
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
    }

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        onDataAvailable(event.data);
      }
    };

    recorder.start(1000); // Collect data every second
    return recorder;
  }, []);

  // Handle chunk completion (when recorder stops)
  const finalizeChunk = useCallback((audioData, chunkIndex, duration, isFinal) => {
    if (audioData.length === 0) {
      console.log(`Chunk ${chunkIndex} has no data, skipping`);
      return;
    }

    const blob = new Blob(audioData, { type: 'audio/webm' });
    console.log(`Finalizing chunk ${chunkIndex}, size: ${blob.size}, duration: ${duration}s, isFinal: ${isFinal}`);

    // Store chunk info
    pendingChunksRef.current.push({
      blob,
      index: chunkIndex,
      duration,
      isFinal
    });

    setTotalChunks(prev => prev + 1);

    // Process immediately
    processChunk(blob, chunkIndex, duration);
  }, [processChunk]);

  // Split the current chunk and start a new one
  const performSplit = useCallback(() => {
    if (!mediaRecorderRef.current || !streamRef.current || isStoppedRef.current) {
      console.log('Cannot split: recorder or stream not available');
      return;
    }

    const currentIndex = chunkCounterRef.current;
    const duration = currentChunkTimeRef.current;

    console.log(`Performing split at chunk ${currentIndex}, duration: ${duration}s`);

    // Stop current recorder and wait for all data
    const oldRecorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null; // Prevent double-stop

    oldRecorder.onstop = () => {
      console.log(`Old recorder stopped, finalizing chunk ${currentIndex}`);

      // Finalize the completed chunk with ALL its data (including final ondataavailable)
      const completedData = [...audioChunksRef.current];
      finalizeChunk(completedData, currentIndex, duration, false);

      // Now reset and start new recorder
      audioChunksRef.current = [];
      chunkCounterRef.current += 1;
      currentChunkTimeRef.current = 0;
      setCurrentChunkTime(0);

      // Start new recorder if still recording
      if (streamRef.current && streamRef.current.active && !isStoppedRef.current) {
        const newRecorder = createAndStartRecorder(streamRef.current, (data) => {
          audioChunksRef.current.push(data);
        });
        mediaRecorderRef.current = newRecorder;
        console.log(`Started new recorder for chunk ${chunkCounterRef.current}`);
      }
    };

    oldRecorder.stop();

  }, [createAndStartRecorder, finalizeChunk]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      console.log('Starting recording session');

      // Reset all state
      isStoppedRef.current = false;
      chunkCounterRef.current = 0;
      currentChunkTimeRef.current = 0;
      audioChunksRef.current = [];
      pendingChunksRef.current = [];

      setRecordingTime(0);
      setCurrentChunkTime(0);
      setTotalChunks(0);
      setCompletedChunks([]);
      setFailedChunks([]);
      setProcessingChunks([]);
      setSessionActive(true);
      setIsRecording(true);

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;

      // Setup audio level monitoring
      setupAudioLevelMonitoring(stream);

      // Create and start recorder
      const recorder = createAndStartRecorder(stream, (data) => {
        audioChunksRef.current.push(data);
      });
      mediaRecorderRef.current = recorder;

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
        currentChunkTimeRef.current += 1;
        setCurrentChunkTime(currentChunkTimeRef.current);
      }, 1000);

      console.log('Recording started successfully');
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
      setSessionActive(false);
      throw error;
    }
  }, [setupAudioLevelMonitoring, createAndStartRecorder]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (isStoppedRef.current) {
      console.log('Already stopped');
      return;
    }

    console.log('Stopping recording session');
    isStoppedRef.current = true;

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const currentIndex = chunkCounterRef.current;
    const duration = currentChunkTimeRef.current;
    const currentData = [...audioChunksRef.current];

    // Stop recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const recorder = mediaRecorderRef.current;

      recorder.onstop = () => {
        console.log(`Final recorder stopped, finalizing chunk ${currentIndex}`);

        // Finalize the last chunk
        if (currentData.length > 0 && duration > 0) {
          finalizeChunk(currentData, currentIndex, duration, true);
        } else {
          console.log('No data in final chunk');
          // If no chunks at all, still need to trigger completion
          if (pendingChunksRef.current.length === 0) {
            setSessionActive(false);
          }
        }

        // Stop stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        cleanupAudioContext();
        setIsRecording(false);
        mediaRecorderRef.current = null;
      };

      recorder.stop();
    } else {
      // Recorder already stopped
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      cleanupAudioContext();
      setIsRecording(false);
      setSessionActive(false);
    }
  }, [finalizeChunk, cleanupAudioContext]);

  // Auto-split effect
  useEffect(() => {
    // Only split if we have an active recorder (mediaRecorderRef.current is set)
    // This prevents multiple splits while one is in progress
    if (isRecording && currentChunkTime >= chunkDurationSeconds && !isStoppedRef.current && mediaRecorderRef.current) {
      console.log(`Auto-split triggered at ${currentChunkTime}s (chunk duration: ${chunkDurationSeconds}s)`);
      performSplit();
    }
  }, [isRecording, currentChunkTime, chunkDurationSeconds, performSplit]);

  // Check for all chunks completion
  useEffect(() => {
    if (!sessionActive || isRecording) return;

    const total = totalChunks;
    const completed = completedChunks.length;
    const failed = failedChunks.length;
    const processing = processingChunks.length;

    console.log(`Chunk status: total=${total}, completed=${completed}, failed=${failed}, processing=${processing}`);

    if (total > 0 && (completed + failed) === total && processing === 0) {
      console.log('All chunks processed, calling onAllChunksComplete');
      if (onAllChunksCompleteRef.current) {
        onAllChunksCompleteRef.current(completedChunks, failedChunks);
      }
      setSessionActive(false);
    }
  }, [sessionActive, isRecording, totalChunks, completedChunks, failedChunks, processingChunks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      cleanupAudioContext();
    };
  }, [cleanupAudioContext]);

  return {
    // State
    isRecording,
    recordingTime,
    audioLevel,
    currentChunkTime,
    sessionActive,

    // Chunk tracking
    totalChunks,
    processingChunks,
    completedChunks,
    failedChunks,

    // Actions
    startRecording,
    stopRecording,

    // Utilities
    formatTime: (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`,
    chunkDurationSeconds
  };
}

export default useChunkedRecording;
