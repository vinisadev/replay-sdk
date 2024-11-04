interface EventData {
  type: string;
  data: any;
  timestamp: number;
}

interface SDKConfig {
  websiteId: string;
  apiEndpoint: string;
  debug?: boolean;
}

class ReplaySDK {
  private events: EventData[] = [];
  private websiteId: string;
  private sessionId: string;
  private apiEndpoint: string;
  private debug: boolean;
  private isRunning: boolean = false;
  private sendInterval: any;
  private lastDOMSnapshot: string = '';
  private domSnapshotTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: SDKConfig) {
    this.websiteId = config.websiteId;
    this.apiEndpoint = config.apiEndpoint;
    this.debug = config.debug || false;
    this.sessionId = this.generateSessionId();

    this.initializeEventListeners();
    this.startEventSending();
    this.captureInitialState();
  }

  private captureInitialState(): void {
    // Capture initial DOM state
    this.captureEvent('domSnapshot', {
      html: this.sanitizeDOM(document.documentElement.outerHTML),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      url: window.location.href
    })

    // Capture initial scroll position
    this.captureEvent('scroll', {
      scrollX: window.scrollX,
      scrollY: window.scrollY
    })

    // Setup DOM mutation observer
    const observer = new MutationObserver(this.handleDOMMutation.bind(this))
    observer.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeOldValue: true,
      characterDataOldValue: true
    })
  }

  private sanitizeDOM(html: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Remove scripts
    doc.querySelectorAll('script').forEach(el => el.remove())

    // Remove event handlers
    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name)
        }
      })
    })

    // Remove sensitive input values
    doc.querySelectorAll('input, textarea').forEach(el => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el.type === 'password' || el.type === 'hidden') {
          el.value = ''
        }
      }
    })

    return doc.documentElement.outerHTML
  }

  private handleDOMMutation(mutations: MutationRecord[]): void {
    // Throttle DOM snapshots
    if (this.domSnapshotTimeout) {
      clearTimeout(this.domSnapshotTimeout)
    }
    
    this.domSnapshotTimeout = setTimeout(() => {
      const currentDOM = this.sanitizeDOM(document.documentElement.outerHTML)
      if (currentDOM !== this.lastDOMSnapshot) {
        this.captureEvent('domSnapshot', {
          html: currentDOM,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          url: window.location.href
        })
        this.lastDOMSnapshot = currentDOM
      }
    }, 1000)
  }

  private log(message: string, ...args: any[]) {
    if (this.debug) {
      console.log(`[ReplaySDK] ${message}`, ...args);
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private initializeEventListeners(): void {
    this.log('Initializing event listeners');

    // Mouse move events (throttled)
    let lastMoveTime = 0;
    document.addEventListener('mousemove', (e: MouseEvent) => {
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
    document.addEventListener('click', (e: MouseEvent) => {
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

    this.log('Event listeners initialized');
  }

  private startEventSending(): void {
    this.isRunning = true;
    this.sendInterval = setInterval(() => {
      this.sendEvents();
    }, 1000); // Send events every second

    this.log('Event sending started');
  }

  private captureEvent(type: string, data: any): void {
    const event: EventData = {
      type,
      data,
      timestamp: Date.now()
    };
    this.events.push(event);
    this.log('Event captured:', event);
  }

  private async sendEvents(): Promise<void> {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    this.log('Sending events:', eventsToSend);

    try {
      const response = await fetch(`${this.apiEndpoint}/api/events`, {
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      this.log('Events sent successfully:', result);
    } catch (error) {
      this.log('Failed to send events:', error);
      // If sending fails, add the events back to the queue
      this.events = [...eventsToSend, ...this.events];
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
    }
    this.log('Session recording stopped');
  }
}

export default ReplaySDK;