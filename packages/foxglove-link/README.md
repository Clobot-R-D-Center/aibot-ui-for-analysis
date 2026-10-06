# @aibot/foxglove-link

For adapters whose robots run ROS 2: one
[foxglove_bridge](https://github.com/foxglove/foxglove-sdk/tree/main/ros/src/foxglove_bridge)
WebSocket client per robot, subscribed to just the topics you list and
decoding their messages (CDR) with the schemas the bridge advertises.

```ts
import { foxgloveLinks } from "@aibot/foxglove-link";

const links = foxgloveLinks({
	port: 8765,
	topics: ["/task_result", "/battery"],
	onLink: (robot, up) => sink.link(robot, up),
	onMessage: (robot, topic, msg) => {/* decoded message → sink calls */},
});
links.update("robot-1", "192.168.0.11", true); // whenever reachability is known
```

- `update(robot, host, online)` links an online robot, follows a host change, and
  drops an offline robot. A lost link retries every 5 s while the robot stays online.
- `int64`/`uint64` fields decode as `BigInt`, so convert them with `Number()`.
- Only the listed topics are pulled off the robot. Lidar, maps and other heavy
  topics stay put unless you ask for them.

## On each robot

The gateway connects to every robot it should read from, so each one runs
the bridge, reachable from the gateway PC:

```bash
sudo apt install ros-$ROS_DISTRO-foxglove-bridge
ros2 launch foxglove_bridge foxglove_bridge_launch.xml \
  port:=8765 \
  topic_whitelist:="['^/task_result$', '^/battery$']" \
  capabilities:="[connectionGraph]"
```

- **`topic_whitelist`** limits what the bridge exposes. List the topics your adapter uses.
- **`capabilities`**: the bridge's default enables `clientPublish`, `services`
  and `parameters`, so anyone on the network could publish to the robot's
  topics, call its services or change its parameters. The gateway only
  subscribes, so leave them out.
- The bridge listens on all interfaces (`address` `0.0.0.0`). Keep it to the
  robots' LAN, or put a firewall in front.

See the bridge's README for all parameters.
