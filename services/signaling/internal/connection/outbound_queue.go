package connection

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/gorilla/websocket"
)

type outboundMessage struct {
	data      []byte
	closeCode int
	reason    string
}

func (client *client) startWriter(messages, bytes int) {
	client.outbound = make(chan outboundMessage, messages)
	client.outboundBytes = bytes
	client.writerStop = make(chan struct{})
	client.writerDone = make(chan struct{})
	go func() {
		defer close(client.writerDone)
		defer client.connection.Close()
		for {
			select {
			case <-client.writerStop:
				return
			case packet := <-client.outbound:
				client.mu.Lock()
				client.queuedBytes -= len(packet.data)
				client.mu.Unlock()
				if len(packet.data) > 0 {
					_ = client.connection.SetWriteDeadline(time.Now().Add(client.writeTimeout))
					if err := client.connection.WriteMessage(websocket.TextMessage, packet.data); err != nil {
						return
					}
					client.mu.Lock()
					client.messagesOut++
					client.mu.Unlock()
				}
				if packet.closeCode != 0 {
					_ = client.connection.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(packet.closeCode, packet.reason), time.Now().Add(client.writeTimeout))
					return
				}
			}
		}
	}()
}

func (client *client) enqueueLocked(value any, code int, reason string) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if len(data)+client.queuedBytes > client.outboundBytes {
		_ = client.connection.Close()
		return errors.New("outbound byte budget exhausted")
	}
	select {
	case client.outbound <- outboundMessage{data, code, reason}:
		client.queuedBytes += len(data)
		return nil
	default:
		_ = client.connection.Close()
		return errors.New("outbound message queue exhausted")
	}
}

func (client *client) stopWriter() {
	if client.writerStop == nil {
		return
	}
	client.writerStopOnce.Do(func() { close(client.writerStop) })
	_ = client.connection.Close()
	<-client.writerDone
}

func (client *client) end(value any, code int, reason string) <-chan struct{} {
	client.mu.Lock()
	if client.outbound == nil {
		if value != nil {
			_ = client.writeLocked(value)
		}
		client.revoked = true
		client.mu.Unlock()
		client.close(code, reason)
		_ = client.connection.Close()
		done := make(chan struct{})
		close(done)
		return done
	}
	client.revoked = true
	client.rtcReady = false
	if value == nil {
		_ = client.connection.Close()
	} else {
		_ = client.enqueueLocked(value, code, reason)
	}
	client.mu.Unlock()
	return client.writerDone
}
