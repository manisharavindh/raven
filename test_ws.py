import asyncio
import websockets

async def test():
    try:
        async with websockets.connect('ws://127.0.0.1:8000/ws/feed') as ws:
            print("Connected!")
            msg = await ws.recv()
            print(f"Received: {type(msg)} len={len(msg)}")
    except Exception as e:
        print(f"Failed: {e}")

asyncio.run(test())
