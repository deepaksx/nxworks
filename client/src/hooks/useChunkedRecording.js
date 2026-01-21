import { useState, useRef, useCallback, useEffect } from 'react';

const CHUNK_DURATION_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
const CHUNK_DURATION_SECONDS = 5 * 60; // 5 minutes in seconds

/**
 * Hook for managing chunked audio recording with automatic splitting
 * When recording exceeds 5 minutes, it automatically splits and starts processing
 * the completed chunk while continuing to record
 */
export function useChunkedRecording({
  onChunkReady,
  onChunkProcessed,
  onChunkError,
  onAllChunksComplete
}) {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentChunkTime, setCurrentChunkTime] = useState(0);

  // Chunk tracking
  const [chunks, setChunks] = useState([]);
  const [processingChunks, setProcessingChunks] = useState([]);
  const [completedChunks, setCompletedChunks] = useState([]);
  const [failedChunks, setFailedChunks] = useState([]);

  // Session state
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const chunkTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const chunkCounterRef = useRef(0);
  const currentChunkStartTimeRef = useRef(0);
  const isStoppingRef = useRef(false);

  // Cleanup audio context and animation frames
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
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    analyserRef.current.fftSize = 256;

    const updateAudioLevel = () => {
      if (!analyserRef.current) return;
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(Math.min(100, average * 1.5));
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    };
    updateAudioLevel();
  }, []);

  // Create a MediaRecorder instance
  const createMediaRecorder = useCallback((stream) => {
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
    }
    return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  }, []);

  // Process a completed chunk
  const processChunk = useCallback(async (chunkBlob, chunkIndex, duration) => {
    const chunkId = `chunk-${sessionId}-${chunkIndex}`;

    setProcessingChunks(prev => [...prev, { id: chunkId, index: chunkIndex }]);

    try {
      // Notify that chunk is ready for processing
      if (onChunkReady) {
        const result = await onChunkReady(chunkBlob, chunkIndex, duration);

        setCompletedChunks(prev => [...prev, {
          id: chunkId,
          index: chunkIndex,
          result,
          duration
        }]);

        if (onChunkProcessed) {
          onChunkProcessed(chunkIndex, result);
        }
      }
    } catch (error) {
      console.error(`Error processing chunk ${chunkIndex}:`, error);
      setFailedChunks(prev => [...prev, {
        id: chunkId,
        index: chunkIndex,
        error: error.message
      }]);

      if (onChunkError) {
        onChunkError(chunkIndex, error);
      }
    } finally {
      setProcessingChunks(prev => prev.filter(c => c.id !== chunkId));
    }
  }, [sessionId, onChunkReady, onChunkProcessed, onChunkError]);

  // Finalize a chunk and start a new one
  const splitChunk = useCallback(() => {
    if (!mediaRecorderRef.current || isStoppingRef.current) return;

    const currentChunkIndex = chunkCounterRef.current;
    const chunkDuration = currentChunkTime;

    console.log(`Splitting chunk ${currentChunkIndex} at ${chunkDuration} seconds`);

    // Stop current recording to get the blob
    mediaRecorderRef.current.stop();

    // Create a handler for when the recorder stops
    const handleStop = () => {
      if (isStoppingRef.current) return;

      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

      // Add to chunks list
      setChunks(prev => [...prev, {
        index: currentChunkIndex,
        blob,
        duration: chunkDuration,
        status: 'pending'
      }]);

      // Start processing this chunk in background
      processChunk(blob, currentChunkIndex, chunkDuration);

      // Reset for next chunk
      audioChunksRef.current = [];
      chunkCounterRef.current += 1;
      setCurrentChunkTime(0);
      currentChunkStartTimeRef.current = recordingTime;

      // Start a new MediaRecorder if still recording
      if (!isStoppingRef.current && streamRef.current && streamRef.current.active) {
        const newRecorder = createMediaRecorder(streamRef.current);

        newRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        newRecorder.start(1000);
        mediaRecorderRef.current = newRecorder;

        console.log(`Started new chunk ${chunkCounterRef.current}`);
      }
    };

    mediaRecorderRef.current.onstop = handleStop;
  }, [currentChunkTime, recordingTime, processChunk, createMediaRecorder]);

  // Start recording session
  const startRecording = useCallback(async () => {
    try {
      isStoppingRef.current = false;

      // Generate session ID
      const newSessionId = `session-${Date.now()}`;
      setSessionId(newSessionId);

      // Reset state
      setChunks([]);
      setProcessingChunks([]);
      setCompletedChunks([]);
      setFailedChunks([]);
      chunkCounterRef.current = 0;
      audioChunksRef.current = [];
      setRecordingTime(0);
      setCurrentChunkTime(0);
      currentChunkStartTimeRef.current = 0;

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;

      // Setup audio level monitoring
      setupAudioLevelMonitoring(stream);

      // Create MediaRecorder
      const recorder = createMediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.start(1000);
      setIsRecording(true);
      setSessionActive(true);

      // Start timers
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
        setCurrentChunkTime(prev => prev + 1);
      }, 1000);

      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }, [setupAudioLevelMonitoring, createMediaRecorder]);

  // Stop recording session
  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || isStoppingRef.current) return;

    isStoppingRef.current = true;
    console.log('Stopping recording session');

    // Clear timers
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const finalChunkIndex = chunkCounterRef.current;
    const finalDuration = currentChunkTime;

    // Handle final chunk
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

      // Only process if there's actual content
      if (blob.size > 0 && finalDuration > 0) {
        setChunks(prev => [...prev, {
          index: finalChunkIndex,
          blob,
          duration: finalDuration,
          status: 'pending'
        }]);

        // Process final chunk
        processChunk(blob, finalChunkIndex, finalDuration);
      }

      // Stop the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      cleanupAudioContext();
      setIsRecording(false);

      console.log('Recording session stopped');
    };

    mediaRecorderRef.current.stop();
  }, [currentChunkTime, processChunk, cleanupAudioContext]);

  // Check if we need to split the chunk
  useEffect(() => {
    if (isRecording && currentChunkTime >= CHUNK_DURATION_SECONDS && !isStoppingRef.current) {
      console.log(`Chunk duration reached ${CHUNK_DURATION_SECONDS}s, splitting...`);
      splitChunk();
    }
  }, [isRecording, currentChunkTime, splitChunk]);

  // Check if all chunks are processed
  useEffect(() => {
    if (!sessionActive || isRecording) return;

    const totalChunks = chunks.length;
    const processedCount = completedChunks.length + failedChunks.length;

    if (totalChunks > 0 && processedCount === totalChunks && processingChunks.length === 0) {
      console.log('All chunks processed');
      if (onAllChunksComplete) {
        onAllChunksComplete(completedChunks, failedChunks);
      }
      setSessionActive(false);
    }
  }, [sessionActive, isRecording, chunks, completedChunks, failedChunks, processingChunks, onAllChunksComplete]);

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
    chunks,
    processingChunks,
    completedChunks,
    failedChunks,
    totalChunks: chunks.length,

    // Actions
    startRecording,
    stopRecording,

    // Utilities
    formatTime: (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`,
    chunkDurationSeconds: CHUNK_DURATION_SECONDS
  };
}

export default useChunkedRecording;
