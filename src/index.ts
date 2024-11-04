interface EventData {
  type: string;
  data: any;
  timestamp: number;
}

class ReplaySDK {
  private events: EventData[] = [];
  private websiteId: string;
  private sessionId: string;
  private apiEndpoint: string;

  constructor(config: { websiteId: string; apiEndpoint: string }) {
    this.websiteId = config.websiteId;
    this.apiEndpoint = config.apiEndpoint;
    this.sessionId = this.generateSessionId();
    this.initializeEventListeners();
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private initializeEventListeners(): void {
    // Mouse move events (throttled)
    let lastMoveTime = 0;
    document.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - lastMoveTime > 50) { // Throttle to 20 events per second
        this.captureEvent('mouseMove', {
          x: e.clientX,
          y: e.clientY
        });
        lastMoveTime = now;
      }
    });

    // Click events
    document.addEventListener('click', (e) => {
      this.captureEvent('click', {
        x: e.clientX,
        y: e.clientY,
        target: (e.target as HTMLElement).tagName.toLowerCase()
      });
    });

    // Scroll events (throttled)
    let lastScrollTime = 0;
    document.addEventListener('scroll', () => {
      const now = Date.now();
      if (now - lastScrollTime > 100) { // Throttle to 10 events per second
        this.captureEvent('scroll', {
          scrollX: window.scrollX,
          scrollY: window.scrollY
        });
        lastScrollTime = now;
      }
    });
  }

  private captureEvent(type: string, data: any): void {
    const event: EventData = {
      type,
      data,
      timestamp: Date.now()
    };
    this.events.push(event);
    this.sendEvents(); // In a real implementation, this would be debounced
  }

  private async sendEvents(): Promise<void> {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    try {
      await fetch(`${this.apiEndpoint}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          websiteId: this.websiteId,
          events: eventsToSend
        }),
      });
    } catch (error) {
      // If sending fails, add the events back to the queue
      this.events = [...eventsToSend, ...this.events];
      console.error('Failed to send events: ', error);
    }
  }
}

export default ReplaySDK;